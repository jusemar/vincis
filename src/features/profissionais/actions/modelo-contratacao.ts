'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { MODELOS_CONTRATACAO, TIPO_PROFISSIONAL_COM_MODELO } from '../constants/modelo-contratacao'

const Schema = z.object({
  usuarioId: z.string().uuid('Profissional inválido.'),
  // `null` volta o cadastro para "não definido" (nada público é exibido).
  modelo: z.enum(MODELOS_CONTRATACAO).nullable(),
})

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestor define o modelo comercial do profissional contábil.
 *
 * Só o Gestor da plataforma (o próprio profissional não escolhe), só para
 * `tipo_profissional = 'contabilidade'` — o CHECK do banco recusa o resto, mas a
 * resposta clara vem daqui. A troca fica no log de auditoria com o antes e o
 * depois.
 */
export async function definirModeloContratacao(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const validacao = Schema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  }
  const { usuarioId, modelo } = validacao.data

  const [perfil] = await db
    .select({ id: perfisProfissionais.id, tipo: perfisProfissionais.tipoProfissional, atual: perfisProfissionais.modeloContratacao })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1)
  if (!perfil) return { sucesso: false as const, mensagem: 'Este usuário não possui cadastro profissional.' }
  if (perfil.tipo !== TIPO_PROFISSIONAL_COM_MODELO) {
    return { sucesso: false as const, mensagem: 'O modelo de contratação vale apenas para profissionais de contabilidade.' }
  }
  if (perfil.atual === modelo) return { sucesso: true as const, mensagem: 'Modelo de contratação mantido.' }

  const ip = await ipDaRequisicao()
  await db.transaction(async (tx) => {
    await tx
      .update(perfisProfissionais)
      .set({ modeloContratacao: modelo, updatedAt: new Date() })
      .where(and(eq(perfisProfissionais.id, perfil.id), eq(perfisProfissionais.tipoProfissional, TIPO_PROFISSIONAL_COM_MODELO)))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.modeloContratacaoAlterado,
        entidade: 'perfis_profissionais',
        registroAfetado: perfil.id,
        autorId: gestor.id,
        usuarioId,
        origem: 'gestao_vincis',
        ip,
        metadados: { anterior: perfil.atual ?? 'nao_definido', novo: modelo ?? 'nao_definido' },
      },
      tx,
    )
  })

  revalidatePath(`/admin/usuarios/${usuarioId}`)
  revalidatePath('/profissionais')
  revalidatePath('/perfil-profissional')
  return { sucesso: true as const, mensagem: 'Modelo de contratação atualizado com sucesso' }
}
