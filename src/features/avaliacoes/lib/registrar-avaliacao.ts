import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentos,
  avaliacoesAtendimento,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_EVENTO_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import { difundirSegmentado } from '@/features/atendimentos/lib/difusao'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes } from '@/features/notificacoes/lib/emitir'
import {
  NOTA_MAXIMA,
  NOTA_MINIMA,
  STATUS_QUE_PERMITE_AVALIAR,
  TAMANHO_MAXIMO_COMENTARIO,
  type MotivoRecusaAvaliacao,
} from '../constants/avaliacao'

export type ResultadoAvaliacao =
  | {
      sucesso: true
      avaliacaoId: string
      nota: number
      /** `false` quando a avaliação já existia e foi atualizada. */
      criada: boolean
      criadoEm: Date
      atualizadoEm: Date
    }
  | { sucesso: false; motivo: MotivoRecusaAvaliacao }

/**
 * Sanitiza o comentário do Cliente.
 *
 * Não é moderação — esta etapa não tem moderação. É higiene de texto: tira os
 * espaços das pontas, normaliza quebras de linha exageradas e corta no teto.
 * Um texto que sobra só espaço vira ausência de comentário, porque um card
 * público com aspas vazias é pior do que card nenhum.
 *
 * O conteúdo não é interpretado como HTML em lugar nenhum (React escapa tudo o
 * que renderiza), então a limpeza não precisa — nem deve — reescrever o que a
 * pessoa quis dizer.
 */
export function sanitizarComentario(bruto: string | null | undefined) {
  if (!bruto) return null
  const limpo = bruto
    .replace(/\r\n/g, '\n')
    // Três quebras ou mais viram duas: o card do perfil público tem altura, e
    // uma coluna de linhas vazias empurraria o vizinho do grid.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, TAMANHO_MAXIMO_COMENTARIO)
  return limpo.length ? limpo : null
}

/** A nota é inteira e está entre 1 e 5. Zero, seis e 4,5 não são notas. */
export function notaValida(nota: unknown): nota is number {
  return (
    typeof nota === 'number' &&
    Number.isInteger(nota) &&
    nota >= NOTA_MINIMA &&
    nota <= NOTA_MAXIMA
  )
}

/**
 * Registra — ou atualiza — a avaliação de um Atendimento concluído.
 *
 * Toda a regra de quem pode avaliar vive aqui, e não na tela:
 *
 * - **só o Cliente proprietário.** A comparação é contra
 *   `atendimentos.cliente_usuario_id` lido do banco. Nem o prestador, nem o
 *   responsável, nem um participante convidado passam — e nenhum deles pode
 *   avaliar "em nome do" Cliente, porque o autor vem da sessão e o id do
 *   Cliente nunca é aceito por parâmetro;
 * - **só Atendimento concluído.** Concluir é o fato que autoriza avaliar;
 * - **uma avaliação por Atendimento e Prestador avaliado.** Quem garante é o
 *   índice único, não este código: a gravação é um `INSERT ... ON CONFLICT DO
 *   UPDATE`, de modo que o clique duplo e a requisição repetida convergem para
 *   a mesma linha em vez de disputarem duas.
 *
 * Quem é avaliado é o **Prestador principal** do Atendimento. Participantes
 * convidados não herdam a nota: a reputação pública é de quem foi contratado.
 *
 * O Atendimento não é tocado. Nem status, nem `updated_at`, nem entrega: a
 * avaliação é uma camada posterior e precisa poder ser escrita sem reabrir o
 * que já foi fechado.
 */
export async function registrarAvaliacao({
  atendimentoId,
  usuarioId,
  nota,
  comentario,
}: {
  atendimentoId: string
  /** Quem está avaliando. Vem da sessão — nunca do formulário. */
  usuarioId: string
  nota: number
  comentario?: string | null
}): Promise<ResultadoAvaliacao> {
  if (!notaValida(nota)) return { sucesso: false, motivo: 'nota-invalida' }

  const [alvo] = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      status: atendimentos.status,
      prestadorId: atendimentos.prestadorId,
      responsavelId: atendimentos.responsavelId,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)

  if (!alvo) return { sucesso: false, motivo: 'nao-encontrado' }
  // Um id manipulado morre aqui: quem não é o dono recebe a mesma recusa,
  // esteja ele ligado ao Atendimento de outra forma ou não ligado a nada.
  if (alvo.clienteUsuarioId !== usuarioId) {
    return { sucesso: false, motivo: 'sem-acesso' }
  }
  if (alvo.status !== STATUS_QUE_PERMITE_AVALIAR) {
    return { sucesso: false, motivo: 'nao-concluido' }
  }

  const texto = sanitizarComentario(comentario)
  const agora = new Date()

  const [autor] = await db
    .select({ nome: usuarios.nome, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  const nomeCliente = autor?.nome ?? 'O cliente'

  const gravado = await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(avaliacoesAtendimento)
      .values({
        atendimentoId,
        prestadorId: alvo.prestadorId,
        clienteUsuarioId: usuarioId,
        nota,
        comentario: texto,
        createdAt: agora,
        updatedAt: agora,
      })
      .onConflictDoUpdate({
        target: [
          avaliacoesAtendimento.atendimentoId,
          avaliacoesAtendimento.prestadorId,
        ],
        set: { nota, comentario: texto, updatedAt: agora },
      })
      .returning({
        id: avaliacoesAtendimento.id,
        criadoEm: avaliacoesAtendimento.createdAt,
        atualizadoEm: avaliacoesAtendimento.updatedAt,
        /**
         * Foi INSERT ou foi UPDATE?
         *
         * `xmax = 0` é a resposta do próprio Postgres: numa linha recém-inserida
         * a coluna de sistema `xmax` vale zero; numa linha atualizada pelo
         * `ON CONFLICT` ela carrega a transação que a substituiu. Comparar as
         * duas datas daria o mesmo resultado quase sempre — e erraria justo no
         * caso que importa, o de criar e editar dentro do mesmo milissegundo.
         */
        criada: sql<boolean>`(xmax = 0)`,
      })

    const criada = linha.criada

    if (criada) {
      await tx.insert(atendimentoEventos).values({
        atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoAvaliado,
        // O Histórico registra o fato e a hora. O texto da avaliação vive na
        // avaliação e no perfil público; repeti-lo aqui seria uma terceira
        // cópia do mesmo parágrafo, e uma cópia que ninguém consegue corrigir
        // quando o Cliente edita.
        descricao: 'Cliente avaliou o atendimento.',
        autorId: usuarioId,
        // O Cliente vê o próprio ato na linha do tempo dele.
        visivelCliente: true,
        metadados: {
          avaliacaoId: linha.id,
          nota,
          temComentario: Boolean(texto),
          prestadorAvaliadoId: alvo.prestadorId,
        },
      })

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.atendimentoAvaliado,
          entidade: 'avaliacoes_atendimento',
          registroAfetado: linha.id,
          autorId: usuarioId,
          empresaId: autor?.empresaId ?? null,
          origem: 'admin',
          metadados: {
            atendimentoId,
            prestadorAvaliadoId: alvo.prestadorId,
            nota,
          },
        },
        tx,
      )

      // Quem é avisado: o Prestador dono e o responsável atual — os dois
      // vínculos que respondem pelo Atendimento. Convidados não entram porque a
      // avaliação não é deles (a nota nem alimenta a reputação de nenhum), e
      // avisá-los transformaria um fato em ruído para quem não pode agir sobre
      // ele. O Cliente é o autor e `emitirNotificacoes` já o descarta.
      await emitirNotificacoes(tx, {
        destinatarios: [alvo.prestadorId, alvo.responsavelId],
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.avaliacaoRecebida,
        titulo: `Nova avaliação recebida no ${alvo.protocolo}.`,
        // Resumo sem o comentário: o sino diz que chegou e qual foi a nota; ler
        // o que o Cliente escreveu é um clique adiante, na tela de Avaliações.
        resumo: nota === 1 ? '1 estrela.' : `${nota} estrelas.`,
        recursoTipo: 'atendimento',
        recursoId: atendimentoId,
        atendimentoId,
        protocolo: alvo.protocolo,
        // O Histórico é onde o fato "Cliente avaliou o atendimento." está
        // registrado no contexto do protocolo — é para lá que o clique leva.
        destino: {
          pagina: 'atendimentos',
          atendimento: alvo.protocolo,
          aba: 'historico',
        },
      })
    }

    return {
      avaliacaoId: linha.id,
      criada,
      criadoEm: linha.criadoEm,
      atualizadoEm: linha.atualizadoEm,
    }
  })

  /**
   * Difusão depois do commit, como todo aviso do Atendimento.
   *
   * Na criação vai com texto: é o toast pessoal do Prestador, na variante suave
   * de sucesso do design system — avaliação recebida é boa notícia. Na edição
   * vai sem texto nenhum: a tela aberta do Prestador se atualiza, e ninguém
   * recebe um segundo aviso do mesmo fato. Notificação duplicada por edição é
   * exatamente o que esta etapa não deve produzir.
   */
  await difundirSegmentado({
    tipo: 'avaliacao',
    atendimentoId,
    protocolo: alvo.protocolo,
    autorId: usuarioId,
    aba: 'historico',
    severidade: 'sucesso',
    avisos: gravado.criada
      ? [
          {
            destinatarios: [alvo.prestadorId, alvo.responsavelId],
            titulo: `${nomeCliente} avaliou o atendimento ${alvo.protocolo}.`,
          },
        ]
      : [],
  })

  return {
    sucesso: true,
    avaliacaoId: gravado.avaliacaoId,
    nota,
    criada: gravado.criada,
    criadoEm: gravado.criadoEm,
    atualizadoEm: gravado.atualizadoEm,
  }
}

/**
 * A avaliação que este Cliente fez neste Atendimento, se fez.
 *
 * Filtra pelas duas pontas — Atendimento **e** Cliente — para que o portal
 * nunca devolva a avaliação de outra pessoa por um id de Atendimento adivinhado.
 */
export async function obterMinhaAvaliacao(
  atendimentoId: string,
  clienteUsuarioId: string,
) {
  const [linha] = await db
    .select({
      id: avaliacoesAtendimento.id,
      nota: avaliacoesAtendimento.nota,
      comentario: avaliacoesAtendimento.comentario,
      criadoEm: avaliacoesAtendimento.createdAt,
      atualizadoEm: avaliacoesAtendimento.updatedAt,
    })
    .from(avaliacoesAtendimento)
    .where(
      and(
        eq(avaliacoesAtendimento.atendimentoId, atendimentoId),
        eq(avaliacoesAtendimento.clienteUsuarioId, clienteUsuarioId),
      ),
    )
    .limit(1)
  return linha ?? null
}

/** Quantas avaliações um Prestador acumulou. Atalho de leitura para scripts. */
export function contarAvaliacoesDoPrestador(prestadorId: string) {
  return db
    .select({ total: sql<number>`count(*)::int` })
    .from(avaliacoesAtendimento)
    .where(eq(avaliacoesAtendimento.prestadorId, prestadorId))
    .then(([linha]) => linha?.total ?? 0)
}
