'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { oportunidadeMensagens, oportunidades, usuarios } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { marcarNotificacoesDoRecursoComoLidas } from '@/features/atendimentos/lib/leitura'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  avisarMensagemDaOportunidade,
  mensagensDaOportunidade,
  registrarLeituraDaConversa,
} from '../lib/conversa'
import { acessoAConversa } from '../lib/fluxo-direto'
import { avisarEmTempoReal } from '../lib/difundir-oportunidade'
import { OportunidadeIdSchema } from '../schemas/oportunidade'
import { NovaMensagemDaOportunidadeSchema } from '../schemas/conversa'

const NAO_ENCONTRADA = {
  sucesso: false as const,
  mensagem: 'Oportunidade não encontrada.',
}

/**
 * O fluxo direto, em três ações: ler a conversa, escrever nela, e aceitar.
 *
 * Elas moram juntas porque são a **especialização inteira** desta origem. O
 * módulo comercial — proposta, contraproposta, acordo, pagamento, Atendimento —
 * não foi tocado por nenhuma delas: continua nos arquivos de sempre, atendendo
 * as Oportunidades tradicionais exatamente como antes.
 *
 * Todas passam por `acessoAConversa`, que é a porta única: fluxo direto, pessoa
 * com vínculo, e — para escrever — solicitação ainda viva. Nenhuma delas
 * confere identidade por conta própria.
 */

/**
 * A conversa daquela Oportunidade, e a marca de que quem pediu acabou de lê-la.
 *
 * Carregar **é** ler: quem abriu a conversa viu o que estava nela, e deixar o
 * sino aceso depois disso seria pedir à pessoa que marcasse à mão o que acabou
 * de ler. A marca e o silenciamento dos avisos usam as mesmas funções do
 * Atendimento.
 */
export async function carregarConversaDaOportunidade(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return NAO_ENCONTRADA

  const validacao = OportunidadeIdSchema.safeParse(entrada)
  if (!validacao.success) return NAO_ENCONTRADA

  const acesso = await acessoAConversa(
    validacao.data.oportunidadeId,
    sessao.id,
  )
  if (!acesso) return NAO_ENCONTRADA

  const mensagens = await mensagensDaOportunidade(acesso.oportunidade.id)

  if (mensagens.length) {
    await registrarLeituraDaConversa(sessao.id, acesso.oportunidade.id)
    await marcarNotificacoesDoRecursoComoLidas(db, {
      destinatarioId: sessao.id,
      recursoTipo: 'oportunidade',
      recursoId: acesso.oportunidade.id,
      tipos: [TIPOS_NOTIFICACAO.mensagemOportunidade],
    })
  }

  return {
    sucesso: true as const,
    mensagem: 'Conversa carregada.',
    dados: {
      mensagens,
      podeEscrever: acesso.podeEscrever,
      papel: acesso.papel,
      euSou: sessao.id,
    },
  }
}

/**
 * Envia uma mensagem na conversa da Oportunidade.
 *
 * Sem pagamento, sem Atendimento, sem proposta: as duas pontas conversam
 * enquanto a solicitação estiver viva. Recusada ou vencida, o histórico
 * continua legível e ninguém escreve mais — um "não tenho interesse" que o
 * teclado desfizesse não seria uma decisão.
 */
export async function enviarMensagemDaOportunidade(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return NAO_ENCONTRADA

  const validacao = NovaMensagemDaOportunidadeSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Mensagem inválida.',
    }
  }
  const { oportunidadeId, conteudo } = validacao.data

  const acesso = await acessoAConversa(oportunidadeId, sessao.id)
  if (!acesso) return NAO_ENCONTRADA
  if (!acesso.podeEscrever) {
    return {
      sucesso: false as const,
      mensagem: 'Esta solicitação foi encerrada e não recebe mais mensagens.',
    }
  }

  const [autor] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, sessao.id))
    .limit(1)

  try {
    const [gravada] = await db.transaction(async (tx) => {
      const inseridas = await tx
        .insert(oportunidadeMensagens)
        .values({ oportunidadeId, autorId: sessao.id, conteudo })
        .returning({
          id: oportunidadeMensagens.id,
          criadoEm: oportunidadeMensagens.createdAt,
        })

      await avisarMensagemDaOportunidade(tx, {
        oportunidadeId,
        destinatarioId: acesso.outraParte,
        autorId: sessao.id,
        autorNome: autor?.nome ?? 'a outra parte',
        conteudo,
      })

      return inseridas
    })

    // Quem escreveu leu tudo que veio antes — inclusive a própria mensagem.
    await registrarLeituraDaConversa(sessao.id, oportunidadeId, gravada.criadoEm)

    await avisarEmTempoReal({
      destinatarios: [acesso.outraParte],
      titulo: 'Nova mensagem na solicitação',
      oportunidadeId,
      autorId: sessao.id,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Mensagem enviada.',
      dados: { mensagemId: gravada.id },
    }
  } catch (error) {
    console.error('[MENSAGEM_OPORTUNIDADE]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar sua mensagem. Tente novamente.',
    }
  }
}

/**
 * "Tenho interesse": o aceite do fluxo direto.
 *
 * Uma data em `oportunidades.interesse_em`, e mais nada. Sem valor, sem prazo,
 * sem validade — porque é isso que ele significa: *quero conversar com este
 * potencial cliente*. Não é contratação, não fecha acordo, não encerra a
 * solicitação e não cria linha em `oportunidade_propostas` — que é justamente a
 * estrutura cuja existência destranca acordo, pagamento e Atendimento no resto
 * do módulo.
 *
 * Idempotente: clicar duas vezes não move a data nem gera um segundo aviso. É
 * a mesma decisão, e a segunda gravação contaria uma história falsa sobre
 * quando ela foi tomada.
 *
 * O preço que o cliente simulou continua onde estava — no retrato —, e não é
 * copiado para lugar nenhum aqui. Ele é referência do que foi visto, nunca
 * valor a aceitar.
 */
export async function confirmarInteresseNaOportunidade(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return NAO_ENCONTRADA

  const validacao = OportunidadeIdSchema.safeParse(entrada)
  if (!validacao.success) return NAO_ENCONTRADA

  const acesso = await acessoAConversa(
    validacao.data.oportunidadeId,
    sessao.id,
  )
  if (!acesso) return NAO_ENCONTRADA

  // Confirmar interesse é ato de quem foi procurado. O Cliente já demonstrou o
  // dele ao criar a solicitação.
  if (acesso.papel !== 'prestador') {
    return {
      sucesso: false as const,
      mensagem: 'Apenas o profissional escolhido pode confirmar interesse.',
    }
  }
  if (!acesso.podeEscrever) {
    return {
      sucesso: false as const,
      mensagem: 'Esta solicitação não está mais aberta.',
    }
  }

  if (acesso.oportunidade.interesseEm) {
    return {
      sucesso: true as const,
      mensagem: 'Você já confirmou interesse nesta solicitação.',
      dados: { repetido: true },
    }
  }

  const quando = new Date()
  try {
    const marcou = await db.transaction(async (tx) => {
      const [linha] = await tx
        .update(oportunidades)
        .set({ interesseEm: quando, updatedAt: quando })
        .where(eq(oportunidades.id, acesso.oportunidade.id))
        .returning({ id: oportunidades.id })

      await emitirNotificacoes(tx, {
        destinatarios: [acesso.oportunidade.clienteUsuarioId],
        autorId: sessao.id,
        tipo: TIPOS_NOTIFICACAO.oportunidadeInteresse,
        titulo: 'O profissional tem interesse em conversar',
        resumo: resumirTexto(
          `${acesso.oportunidade.titulo} — converse com ele pela própria solicitação.`,
          200,
        ),
        recursoTipo: 'oportunidade',
        recursoId: acesso.oportunidade.id,
        atendimentoId: null,
        protocolo: null,
        destino: {
          pagina: 'oportunidades',
          oportunidadeId: acesso.oportunidade.id,
        },
        // Uma decisão, um aviso: reconfirmar não acende o sino de novo.
        chaveDedupe: `interesse:${acesso.oportunidade.id}`,
      })

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.interesseOportunidadeConfirmado,
          entidade: 'oportunidades',
          registroAfetado: acesso.oportunidade.id,
          autorId: sessao.id,
          usuarioId: sessao.id,
          origem: 'admin',
          metadados: { origemDaOportunidade: acesso.oportunidade.origem },
        },
        tx,
      )

      return linha
    })

    if (!marcou) return NAO_ENCONTRADA

    await avisarEmTempoReal({
      destinatarios: [acesso.oportunidade.clienteUsuarioId],
      titulo: 'O profissional tem interesse em conversar',
      oportunidadeId: acesso.oportunidade.id,
      autorId: sessao.id,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Interesse confirmado. Converse com o cliente por aqui.',
      dados: { repetido: false },
    }
  } catch (error) {
    console.error('[INTERESSE_OPORTUNIDADE]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível confirmar seu interesse. Tente novamente.',
    }
  }
}
