'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { notificacoes } from '@/db/schema'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  contarNaoLidasDoUsuario,
  listarNotificacoesDoUsuario,
} from '../queries/listar-notificacoes'

const NotificacaoSchema = z.object({
  notificacaoId: z.string().uuid('Notificação inválida.'),
})

/** A caixa do sino: as notificações da pessoa logada, mais recentes primeiro. */
export async function carregarNotificacoes() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  const [lista, naoLidas] = await Promise.all([
    listarNotificacoesDoUsuario(sessao.id),
    contarNaoLidasDoUsuario(sessao.id),
  ])

  return {
    sucesso: true as const,
    mensagem: 'Notificações carregadas.',
    dados: { lista, naoLidas },
  }
}

/**
 * Marca uma notificação como lida.
 *
 * O `where` casa o id **com o destinatário**: mandar o id de uma notificação
 * alheia não encontra linha, e a resposta é a mesma de um id inexistente — não
 * dá para descobrir se aquele aviso existe. E marcar como lida não abre porta
 * nenhuma: o recurso apontado continua sendo autorizado por quem o consulta.
 */
export async function marcarNotificacaoLida(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = NotificacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Notificação inválida.' }
  }

  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(
      and(
        eq(notificacoes.id, validacao.data.notificacaoId),
        eq(notificacoes.destinatarioId, sessao.id),
        isNull(notificacoes.lidaEm),
      ),
    )

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Notificação lida.' }
}

/** "Marcar todas como lidas" — restrito à caixa de quem pediu. */
export async function marcarTodasNotificacoesLidas() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(
      and(
        eq(notificacoes.destinatarioId, sessao.id),
        isNull(notificacoes.lidaEm),
      ),
    )

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Todas as notificações foram lidas.' }
}
