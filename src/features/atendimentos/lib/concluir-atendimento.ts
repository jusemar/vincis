import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentos,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import {
  LIMITE_ARQUIVOS_ENTREGA,
  ROTULO_STATUS_ATENDIMENTO,
  TAMANHO_MAXIMO_OBSERVACAO_FINAL,
  TIPOS_EVENTO_ATENDIMENTO,
  type StatusAtendimento,
} from '../constants/atendimento'
import { obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento, respondePeloAtendimento } from './autorizacao'
import { difundirSegmentado } from './difusao'
import type { ExecutorDb } from './executor'
import { podeTransicionar } from './transicoes'

const DESTINO: StatusAtendimento = 'concluido'

export type ResultadoConclusao =
  | {
      sucesso: true
      /** Status de onde o Atendimento saiu. Guardado no evento e no metadado. */
      de: StatusAtendimento
      concluidoEm: Date
      manifestacaoId: string
      arquivosDeEntrega: number
    }
  | {
      sucesso: false
      motivo:
        | 'sem-acesso'
        | 'nao-encontrado'
        | 'ja-concluido'
        | 'transicao-invalida'
        | 'arquivo-invalido'
        | 'checklist-pendente'
      /** Preenchido em `checklist-pendente`: quantas etapas ainda faltam. */
      pendentes?: number
    }

/**
 * Texto formal da conclusão, para o Protocolo.
 *
 * Uma só redação, montada em um lugar: a manifestação é a comunicação oficial da
 * entrega, e ela precisa dizer as três coisas na ordem em que o Cliente lê —
 * que acabou, o que o profissional quis registrar e onde está o resultado.
 *
 * Quando não há observação nem arquivo, sobra a primeira frase: um serviço sem
 * entrega documental continua tendo uma conclusão formal registrada.
 */
export function montarTextoDaConclusao({
  observacaoFinal,
  temEntrega,
}: {
  observacaoFinal: string | null
  temEntrega: boolean
}) {
  const partes = ['Atendimento concluído.']
  if (observacaoFinal) partes.push(observacaoFinal)
  if (temEntrega) {
    partes.push('A entrega final está disponível na aba Arquivos.')
  }
  return partes.join('\n\n')
}

/** Quantas etapas do checklist ainda estão abertas. Nada é marcado aqui. */
export async function contarEtapasPendentes(
  executor: ExecutorDb,
  atendimentoId: string,
) {
  const [linha] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(atendimentoChecklistItens)
    .where(
      and(
        eq(atendimentoChecklistItens.atendimentoId, atendimentoId),
        eq(atendimentoChecklistItens.concluido, false),
      ),
    )
  return linha?.total ?? 0
}

/**
 * Conclui um Atendimento — de verdade.
 *
 * Fecha o ciclo operacional num gesto só: muda o status, grava quem concluiu e
 * quando, guarda a observação final, marca os arquivos escolhidos como entrega,
 * publica a manifestação formal no Protocolo, registra o histórico e avisa os
 * dois lados. Tudo dentro da mesma transação — uma conclusão pela metade seria
 * pior do que nenhuma: o Cliente veria "Concluído" sem encontrar a entrega.
 *
 * **A trava da concorrência e da idempotência é a mesma linha de SQL**: o UPDATE
 * exige `status = <origem>` **e** `concluido_em is null`. Dois cliques (ou dois
 * usuários autorizados ao mesmo tempo) disputam essa condição, um único vence e
 * o outro sai com `ja-concluido` sem ter escrito nada. Não há duplicação de
 * manifestação, de notificação, de arquivo nem de histórico porque nada disso
 * chega a ser executado pelo perdedor.
 *
 * O que **não** acontece aqui, de propósito:
 *
 * - nenhuma mensagem é escrita na Conversa — Protocolo é comunicação formal e
 *   chat é conversa direta; conclusão não inventa recado;
 * - nenhuma etapa do checklist é marcada por conta própria. Etapa pendente é
 *   informada a quem conclui e exige confirmação explícita;
 * - o responsável principal não é trocado. Quem concluiu fica em `concluidoPor`,
 *   que pode ser outra pessoa autorizada.
 */
export async function concluirAtendimento({
  atendimentoId,
  usuarioId,
  observacaoFinal,
  arquivoIds = [],
  confirmarPendencias = false,
}: {
  atendimentoId: string
  usuarioId: string
  observacaoFinal?: string | null
  /** Arquivos já anexados que passam a valer como entrega final. */
  arquivoIds?: string[]
  /** Quem conclui viu as etapas pendentes e mesmo assim decidiu encerrar. */
  confirmarPendencias?: boolean
}): Promise<ResultadoConclusao> {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso || !respondePeloAtendimento(acesso.vinculo)) {
    return { sucesso: false, motivo: 'sem-acesso' }
  }

  const [atual] = await db
    .select({
      status: atendimentos.status,
      concluidoEm: atendimentos.concluidoEm,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)
  if (!atual) return { sucesso: false, motivo: 'nao-encontrado' }

  const de = atual.status as StatusAtendimento
  if (de === DESTINO || atual.concluidoEm) {
    return { sucesso: false, motivo: 'ja-concluido' }
  }
  if (!podeTransicionar(de, DESTINO)) {
    return { sucesso: false, motivo: 'transicao-invalida' }
  }

  const escolhidos = Array.from(new Set(arquivoIds.filter(Boolean))).slice(
    0,
    LIMITE_ARQUIVOS_ENTREGA,
  )
  if (escolhidos.length) {
    // Todo id precisa ser deste Atendimento. Sem esta conferência, um id de
    // outro protocolo entraria como entrega e apareceria para o Cliente errado.
    const encontrados = await db
      .select({ id: atendimentoArquivos.id })
      .from(atendimentoArquivos)
      .where(
        and(
          inArray(atendimentoArquivos.id, escolhidos),
          eq(atendimentoArquivos.atendimentoId, atendimentoId),
        ),
      )
    if (encontrados.length !== escolhidos.length) {
      return { sucesso: false, motivo: 'arquivo-invalido' }
    }
  }

  const pendentes = await contarEtapasPendentes(db, atendimentoId)
  if (pendentes > 0 && !confirmarPendencias) {
    return { sucesso: false, motivo: 'checklist-pendente', pendentes }
  }

  const observacao =
    observacaoFinal?.trim().slice(0, TAMANHO_MAXIMO_OBSERVACAO_FINAL) || null
  const concluidoEm = new Date()

  const [autor] = await db
    .select({ nome: usuarios.nome, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  const nomeAutor = autor?.nome ?? 'Equipe'

  const gravado = await db.transaction(async (tx) => {
    const [atualizado] = await tx
      .update(atendimentos)
      .set({
        status: DESTINO,
        concluidoEm,
        concluidoPor: usuarioId,
        observacaoFinal: observacao,
        updatedAt: concluidoEm,
      })
      .where(
        and(
          eq(atendimentos.id, atendimentoId),
          eq(atendimentos.status, de),
          isNull(atendimentos.concluidoEm),
        ),
      )
      .returning({ id: atendimentos.id })

    // Alguém chegou primeiro. Nada foi escrito: nem manifestação, nem aviso,
    // nem arquivo marcado.
    if (!atualizado) return { conflito: true as const }

    if (escolhidos.length) {
      await tx
        .update(atendimentoArquivos)
        .set({ finalidade: 'entrega_final' })
        .where(
          and(
            inArray(atendimentoArquivos.id, escolhidos),
            eq(atendimentoArquivos.atendimentoId, atendimentoId),
          ),
        )
    }

    const conteudo = montarTextoDaConclusao({
      observacaoFinal: observacao,
      temEntrega: escolhidos.length > 0,
    })

    const [manifestacao] = await tx
      .insert(atendimentoManifestacoes)
      .values({
        atendimentoId,
        autorId: usuarioId,
        papelAutor: 'participante',
        conteudo,
        // A conclusão não é resposta dirigida a uma pessoa: é o fecho do
        // registro formal. Toda a equipe e o Cliente leem a mesma linha — daí
        // `participantes_e_cliente` e não a visibilidade restrita das réplicas.
        visibilidade: 'participantes_e_cliente',
        // Citar o arquivo só faz sentido quando ele é um: com vários, apontar
        // para um deles daria a entender que os outros não fazem parte.
        arquivoId: escolhidos.length === 1 ? escolhidos[0] : null,
      })
      .returning({ id: atendimentoManifestacoes.id })

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoConcluido,
      descricao: `${nomeAutor} concluiu o atendimento.`,
      autorId: usuarioId,
      // O fim do serviço é do Cliente antes de ser de qualquer outro.
      visivelCliente: true,
      metadados: {
        de,
        para: DESTINO,
        deRotulo: ROTULO_STATUS_ATENDIMENTO[de],
        paraRotulo: ROTULO_STATUS_ATENDIMENTO[DESTINO],
        concluidoPor: usuarioId,
        concluidoEm: concluidoEm.toISOString(),
        manifestacaoId: manifestacao.id,
        arquivosDeEntrega: escolhidos.length,
        // O texto da observação vive no Atendimento e no Protocolo; aqui fica
        // só o fato de ter havido uma, para o histórico não virar uma terceira
        // cópia do mesmo parágrafo.
        temObservacaoFinal: Boolean(observacao),
        etapasPendentes: pendentes,
      },
    })

    if (escolhidos.length) {
      await tx.insert(atendimentoEventos).values({
        atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.entregaFinalRegistrada,
        descricao:
          escolhidos.length === 1
            ? 'Entrega final registrada: 1 arquivo.'
            : `Entrega final registrada: ${escolhidos.length} arquivos.`,
        autorId: usuarioId,
        visivelCliente: true,
        metadados: { arquivoIds: escolhidos },
      })
    }

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.atendimentoConcluido,
        entidade: 'atendimentos',
        registroAfetado: atendimentoId,
        autorId: usuarioId,
        empresaId: autor?.empresaId ?? null,
        origem: 'admin',
        metadados: {
          de,
          para: DESTINO,
          arquivosDeEntrega: escolhidos.length,
          etapasPendentes: pendentes,
        },
      },
      tx,
    )

    const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
    if (!audiencia) {
      return {
        conflito: false as const,
        manifestacaoId: manifestacao.id,
        aviso: null,
      }
    }

    const tituloCliente = `Seu atendimento ${audiencia.protocolo} foi concluído.`
    const tituloEquipe = `${audiencia.protocolo} foi concluído por ${nomeAutor}.`
    const resumo = resumirTexto(conteudo)

    // Duas emissões porque as frases são diferentes — e não porque as regras
    // são: a de sempre (ninguém é avisado da própria ação) continua sendo
    // aplicada dentro de `emitirNotificacoes`.
    await emitirNotificacoes(tx, {
      destinatarios: [audiencia.clienteUsuarioId],
      autorId: usuarioId,
      tipo: TIPOS_NOTIFICACAO.atendimentoConcluido,
      titulo: tituloCliente,
      resumo,
      recursoTipo: 'atendimento',
      recursoId: atendimentoId,
      atendimentoId,
      protocolo: audiencia.protocolo,
      destino: {
        pagina: 'atendimentos',
        atendimento: audiencia.protocolo,
        // Havendo entrega, o clique cai onde ela está; sem entrega, no registro
        // formal que explica a conclusão.
        aba: escolhidos.length ? 'arquivos' : 'protocolo',
      },
    })

    await emitirNotificacoes(tx, {
      destinatarios: audiencia.equipe,
      autorId: usuarioId,
      tipo: TIPOS_NOTIFICACAO.atendimentoConcluido,
      titulo: tituloEquipe,
      resumo,
      recursoTipo: 'atendimento',
      recursoId: atendimentoId,
      atendimentoId,
      protocolo: audiencia.protocolo,
      destino: {
        pagina: 'atendimentos',
        atendimento: audiencia.protocolo,
        aba: 'protocolo',
      },
    })

    return {
      conflito: false as const,
      manifestacaoId: manifestacao.id,
      aviso: {
        protocolo: audiencia.protocolo,
        clienteUsuarioId: audiencia.clienteUsuarioId,
        equipe: audiencia.equipe,
        tituloCliente,
        tituloEquipe,
      },
    }
  })

  if (gravado.conflito) return { sucesso: false, motivo: 'ja-concluido' }

  // Depois do commit, como todo aviso do Atendimento: quem receber e recarregar
  // encontra o status novo, a manifestação e a entrega já no lugar.
  if (gravado.aviso) {
    await difundirSegmentado({
      tipo: 'status',
      atendimentoId,
      protocolo: gravado.aviso.protocolo,
      autorId: usuarioId,
      aba: 'protocolo',
      // Conclusão é boa notícia: o toast usa a variante de sucesso do design
      // system, e não o tom neutro de "algo mudou".
      severidade: 'sucesso',
      avisos: [
        {
          destinatarios: [gravado.aviso.clienteUsuarioId],
          titulo: gravado.aviso.tituloCliente,
        },
        { destinatarios: gravado.aviso.equipe, titulo: gravado.aviso.tituloEquipe },
      ],
    })
  }

  return {
    sucesso: true,
    de,
    concluidoEm,
    manifestacaoId: gravado.manifestacaoId,
    arquivosDeEntrega: escolhidos.length,
  }
}
