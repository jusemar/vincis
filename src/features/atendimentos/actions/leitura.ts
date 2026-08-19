'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { atendimentoMensagens } from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { ESCOPOS_MENSAGEM } from '../constants/atendimento'
import { obterAcessoAtendimento } from '../lib/autorizacao'
import {
  marcarNotificacoesDoRecursoComoLidas,
  registrarLeitura,
} from '../lib/leitura'

const ConversaLidaSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  canal: z.enum(ESCOPOS_MENSAGEM),
})

/**
 * Notificações que a leitura de um canal resolve.
 *
 * Só as da Conversa. Uma manifestação do Protocolo ou um arquivo continuam
 * pendentes: abrir o chat não é ter visto o documento que chegou.
 */
const NOTIFICACOES_DA_CONVERSA: string[] = [
  TIPOS_NOTIFICACAO.mensagemConversa,
  TIPOS_NOTIFICACAO.clienteRespondeu,
]

/**
 * Registra que a pessoa leu um canal da Conversa até agora.
 *
 * Chamada quando a aba Conversa aparece com aquele canal selecionado — é o
 * gesto real de leitura. A marca é gravada no servidor, e é por isso que um
 * `F5` depois não faz o badge vermelho voltar: a verdade não está no navegador.
 *
 * Autorização primeiro: quem não tem vínculo com o Atendimento não grava marca
 * nenhuma. Marcar como lida também **não** dá acesso — é uma escrita numa
 * tabela de leitura, não uma permissão.
 */
export async function marcarConversaLida(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConversaLidaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const { atendimentoId, canal } = validacao.data
  const acesso = await obterAcessoAtendimento(atendimentoId, sessao.id)
  if (!acesso) return SEM_AUTORIZACAO
  // O Cliente não tem canal interno: nem para ler, nem para marcar como lido.
  if (acesso.vinculo === 'cliente' && canal === 'interno') return SEM_AUTORIZACAO

  const agora = new Date()

  await db.transaction(async (tx) => {
    const [ultima] = await tx
      .select({ id: atendimentoMensagens.id })
      .from(atendimentoMensagens)
      .where(
        // A âncora é a última mensagem **daquele canal**, não a última do
        // Atendimento: a marca é por canal, e apontar para a mensagem de outro
        // canal daria uma referência que não corresponde à leitura registrada.
        and(
          eq(atendimentoMensagens.atendimentoId, atendimentoId),
          eq(atendimentoMensagens.escopo, canal),
        ),
      )
      .orderBy(desc(atendimentoMensagens.createdAt))
      .limit(1)

    await registrarLeitura(tx, {
      usuarioId: sessao.id,
      escopo: 'atendimento',
      recursoId: atendimentoId,
      canal,
      lidoAte: agora,
      ultimaMensagemLidaId: ultima?.id ?? null,
    })

    await marcarNotificacoesDoRecursoComoLidas(tx, {
      destinatarioId: sessao.id,
      recursoTipo: 'atendimento',
      recursoId: atendimentoId,
      tipos: NOTIFICACOES_DA_CONVERSA,
    })
  })

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return { sucesso: true as const, mensagem: 'Conversa lida.' }
}

const AbaLidaSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  /** Aba aberta: resolve as notificações daquele assunto. */
  aba: z.enum(['protocolo', 'arquivos', 'historico']),
})

/** Tipos de notificação que cada aba do painel resolve ao ser aberta. */
const NOTIFICACOES_POR_ABA: Record<string, string[]> = {
  protocolo: [TIPOS_NOTIFICACAO.manifestacaoProtocolo],
  arquivos: [TIPOS_NOTIFICACAO.arquivoRecebido],
  historico: [TIPOS_NOTIFICACAO.statusAlterado],
}

/**
 * Abrir a aba resolve o aviso daquele assunto.
 *
 * Sem isto, a notificação "novo arquivo no #2026-0003" continuaria acesa depois
 * de a pessoa abrir exatamente a aba Arquivos daquele Atendimento — e ela
 * precisaria ir ao sino apagar à mão o que já resolveu.
 */
export async function marcarAbaVista(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = AbaLidaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const acesso = await obterAcessoAtendimento(
    validacao.data.atendimentoId,
    sessao.id,
  )
  if (!acesso) return SEM_AUTORIZACAO

  await marcarNotificacoesDoRecursoComoLidas(db, {
    destinatarioId: sessao.id,
    recursoTipo: 'atendimento',
    recursoId: validacao.data.atendimentoId,
    tipos: NOTIFICACOES_POR_ABA[validacao.data.aba] ?? [],
  })

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Aba vista.' }
}
