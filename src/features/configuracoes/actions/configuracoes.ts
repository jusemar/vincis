'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { configuracoesPlataforma } from '@/db/schema'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  CHAVE_PRAZO_OPORTUNIDADE,
  CONFIGURACOES,
} from '../lib/configuracoes'

const definicao = CONFIGURACOES[CHAVE_PRAZO_OPORTUNIDADE]

const PrazoSchema = z.object({
  horas: z.coerce
    .number()
    .int('Informe um número inteiro de horas.')
    .min(definicao.minimo, `O prazo mínimo é de ${definicao.minimo} hora(s).`)
    .max(definicao.maximo, `O prazo máximo é de ${definicao.maximo} horas.`),
})

/**
 * Define o prazo global das oportunidades públicas.
 *
 * Só a Gestão Vincis: é uma regra da plataforma, não do escritório de ninguém.
 * A alteração vale para as solicitações **futuras** — as que já estão em curso
 * guardam o próprio `expira_em`, congelado na criação, para que mudar a
 * configuração não encurte nem prolongue negociação já iniciada.
 */
export async function definirPrazoOportunidade(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) {
    return SEM_AUTORIZACAO
  }

  const validacao = PrazoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Prazo inválido.',
    }
  }

  await db
    .insert(configuracoesPlataforma)
    .values({
      chave: CHAVE_PRAZO_OPORTUNIDADE,
      valor: String(validacao.data.horas),
      atualizadoPor: sessao.id,
    })
    .onConflictDoUpdate({
      target: configuracoesPlataforma.chave,
      set: {
        valor: String(validacao.data.horas),
        atualizadoPor: sessao.id,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: `Prazo das oportunidades definido em ${validacao.data.horas} horas.`,
  }
}
