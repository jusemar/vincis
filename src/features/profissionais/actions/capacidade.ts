'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { TIPO_PROFISSIONAL_COM_MODELO } from '../constants/modelo-contratacao'
import { CapacidadeClientesSchema } from '../schemas/capacidade'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Gestor define a capacidade máxima de clientes recorrentes do contador
 * parceiro (`modelo_contratacao = 'vincis'`).
 *
 * Vazio = sem limite definido. Baixar abaixo da ocupação atual é permitido e
 * não remove ninguém: o contador só deixa de receber novos clientes até ficar
 * abaixo do limite. A mudança fica no log de auditoria com o antes e o depois.
 */
export async function definirCapacidadeClientes(entrada: unknown) {
  const gestor = await validarGestorVincis()
  if (!gestor) return { sucesso: false as const, mensagem: 'Operação não autorizada.' }

  const validacao = CapacidadeClientesSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  }
  const { usuarioId } = validacao.data
  const capacidade = validacao.data.capacidade.trim() ? Number(validacao.data.capacidade.trim()) : null

  const [perfil] = await db
    .select({
      id: perfisProfissionais.id,
      tipo: perfisProfissionais.tipoProfissional,
      modelo: perfisProfissionais.modeloContratacao,
      atual: perfisProfissionais.capacidadeClientesRecorrentes,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1)
  if (!perfil) return { sucesso: false as const, mensagem: 'Este usuário não possui cadastro profissional.' }
  if (perfil.tipo !== TIPO_PROFISSIONAL_COM_MODELO || perfil.modelo !== 'vincis') {
    return {
      sucesso: false as const,
      mensagem: 'A capacidade vale apenas para contadores com o modelo “Contratação pela Vincis”.',
    }
  }
  if (perfil.atual === capacidade) return { sucesso: true as const, mensagem: 'Capacidade mantida.' }

  const ip = await ipDaRequisicao()
  await db.transaction(async (tx) => {
    await tx
      .update(perfisProfissionais)
      .set({ capacidadeClientesRecorrentes: capacidade, updatedAt: new Date() })
      .where(and(eq(perfisProfissionais.id, perfil.id), eq(perfisProfissionais.modeloContratacao, 'vincis')))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.capacidadeContadorAlterada,
        entidade: 'perfis_profissionais',
        registroAfetado: perfil.id,
        autorId: gestor.id,
        usuarioId,
        origem: 'gestao_vincis',
        ip,
        metadados: { anterior: perfil.atual, nova: capacidade },
      },
      tx,
    )
  })

  revalidatePath(`/admin/usuarios/${usuarioId}`)
  revalidatePath('/admin/planos')
  revalidatePath('/precos')
  return { sucesso: true as const, mensagem: capacidade === null ? 'Capacidade sem limite definido.' : 'Capacidade salva.' }
}
