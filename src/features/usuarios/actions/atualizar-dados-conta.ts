'use server'

import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import { obterSessaoServidor } from '../lib/sessao-servidor'
import { DadosContaSchema } from '../schemas/dados-conta'
import type { ResultadoPadrao } from '../types'

/**
 * Atualiza os dados pessoais da própria conta.
 *
 * O usuário alvo é sempre o da sessão — nunca um id vindo do cliente. Assim não
 * existe superfície para editar a conta de outra pessoa, e a action serve
 * qualquer perfil sem virar uma porta de administração.
 *
 * Trocar o WhatsApp derruba a verificação feita pela Gestão: ela atestava
 * aquele número específico, e manter o selo sobre um número novo seria afirmar
 * algo que ninguém confirmou.
 */
export async function atualizarDadosConta(
  entrada: unknown,
): Promise<ResultadoPadrao> {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { sucesso: false, mensagem: 'Sessão expirada.' }

  const validacao = DadosContaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Revise seus dados.',
    }
  }

  const { nome, whatsapp } = validacao.data

  try {
    const [emUso] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(eq(usuarios.whatsapp, whatsapp), ne(usuarios.id, sessao.id)))
      .limit(1)

    if (emUso) {
      return {
        sucesso: false,
        mensagem: 'Este WhatsApp já está em uso por outra conta.',
      }
    }

    const [atual] = await db
      .select({
        whatsapp: usuarios.whatsapp,
        emailVerificado: usuarios.emailVerificado,
        whatsappVerificado: usuarios.whatsappVerificado,
      })
      .from(usuarios)
      .where(eq(usuarios.id, sessao.id))
      .limit(1)

    const trocouNumero = atual?.whatsapp !== whatsapp
    const perdeVerificacao = trocouNumero && atual?.whatsappVerificado

    // Se o WhatsApp é o único método que comprova a identidade, trocar o número
    // deixaria a conta sem verificação nenhuma — o usuário se trancaria para
    // fora. Recusamos e apontamos a saída, em vez de executar e quebrar.
    if (perdeVerificacao && !atual?.emailVerificado) {
      return {
        sucesso: false,
        mensagem:
          'Seu acesso está confirmado por este WhatsApp. Confirme seu e-mail antes de trocar o número, ou fale com a Vincis.',
      }
    }

    await db
      .update(usuarios)
      .set({
        nome,
        whatsapp,
        ...(perdeVerificacao
          ? {
              whatsappVerificado: false,
              whatsappVerificadoEm: null,
              whatsappVerificadoPorId: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(usuarios.id, sessao.id))

    revalidatePath('/cliente')
    return {
      sucesso: true,
      mensagem: perdeVerificacao
        ? 'Dados atualizados. O novo WhatsApp precisa ser confirmado novamente pela Vincis.'
        : 'Dados atualizados com sucesso.',
    }
  } catch (error) {
    console.error('[ATUALIZAR_DADOS_CONTA]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false,
      mensagem: 'Não foi possível atualizar seus dados. Tente novamente.',
    }
  }
}
