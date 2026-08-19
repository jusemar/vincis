'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, usuarios } from '@/db/schema'
import { validarGestorVincis } from '../lib/validar-gestor-vincis'
import { UsuarioGestaoIdSchema } from '../schemas/gestao-usuarios'
import type { ResultadoPadrao } from '../types'

export async function desativarUsuarioGestao(usuarioId: string): Promise<ResultadoPadrao> {
  const gestor = await validarGestorVincis()
  const id = UsuarioGestaoIdSchema.safeParse(usuarioId)
  if (!gestor || !id.success) return { sucesso: false, mensagem: 'Operação não autorizada.' }
  if (gestor.id === id.data) return { sucesso: false, mensagem: 'Você não pode desativar sua própria conta.' }

  return db.transaction(async (tx) => {
    const [usuario] = await tx
      .select({ status: usuarios.status })
      .from(usuarios)
      .where(eq(usuarios.id, id.data))
      .limit(1)
      .for('update')

    if (!usuario || usuario.status !== 'ativo') {
      return { sucesso: false, mensagem: 'A conta não está disponível para desativação.' }
    }

    await tx.update(usuarios).set({ status: 'bloqueado', updatedAt: new Date() }).where(eq(usuarios.id, id.data))
    await tx
      .update(sessoesUsuario)
      .set({ encerradaEm: new Date() })
      .where(and(eq(sessoesUsuario.usuarioId, id.data), isNull(sessoesUsuario.encerradaEm)))

    return { sucesso: true, mensagem: 'Conta desativada e sessões revogadas.' }
  })
}

export async function reativarUsuarioGestao(usuarioId: string): Promise<ResultadoPadrao> {
  const gestor = await validarGestorVincis()
  const id = UsuarioGestaoIdSchema.safeParse(usuarioId)
  if (!gestor || !id.success) return { sucesso: false, mensagem: 'Operação não autorizada.' }

  const [usuario] = await db
    .update(usuarios)
    .set({ status: 'ativo', updatedAt: new Date() })
    .where(and(eq(usuarios.id, id.data), eq(usuarios.status, 'bloqueado')))
    .returning({ id: usuarios.id })

  return usuario
    ? { sucesso: true, mensagem: 'Conta reativada com sucesso.' }
    : { sucesso: false, mensagem: 'A conta não está disponível para reativação.' }
}

