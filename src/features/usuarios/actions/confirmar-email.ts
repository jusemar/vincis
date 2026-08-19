'use server'

import { createHash } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { tokensUsuario, usuarios } from '@/db/schema'
import { ConfirmacaoEmailSchema, type ConfirmacaoEmailDTO } from '../schemas/confirmacao-email'
import type { ResultadoPadrao } from '../types'

export async function confirmarEmail(dados: ConfirmacaoEmailDTO): Promise<ResultadoPadrao> {
  const validated = ConfirmacaoEmailSchema.safeParse(dados)

  if (!validated.success) {
    return {
      sucesso: false,
      mensagem: 'Token inválido',
    }
  }

  const tokenHash = createHash('sha256').update(validated.data.token).digest('hex')

  try {
    return await db.transaction(async (tx): Promise<ResultadoPadrao> => {
      const [tokenValido] = await tx
        .select({
          id: tokensUsuario.id,
          usuarioId: tokensUsuario.usuarioId,
        })
        .from(tokensUsuario)
        .where(
          and(
            eq(tokensUsuario.tokenHash, tokenHash),
            eq(tokensUsuario.tipo, 'confirmacao_email'),
            isNull(tokensUsuario.usadoEm),
            gt(tokensUsuario.expiraEm, new Date()),
          ),
        )
        .limit(1)
        .for('update')

      if (!tokenValido) {
        return {
          sucesso: false,
          mensagem: 'Token inválido ou expirado',
        }
      }

      const [usuario] = await tx
        .select({ status: usuarios.status })
        .from(usuarios)
        .where(eq(usuarios.id, tokenValido.usuarioId))
        .limit(1)

      if (!usuario || usuario.status === 'bloqueado') {
        return {
          sucesso: false,
          mensagem: 'Esta conta não pode ser confirmada',
        }
      }

      const agora = new Date()

      await tx
        .update(usuarios)
        .set({
          emailVerificado: true,
          emailVerificadoEm: agora,
          status: 'ativo',
          updatedAt: agora,
        })
        .where(eq(usuarios.id, tokenValido.usuarioId))

      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(eq(tokensUsuario.id, tokenValido.id))

      return {
        sucesso: true,
        mensagem: 'E-mail confirmado com sucesso',
      }
    })
  } catch (error) {
    console.error('[CONFIRMAR_EMAIL]', error)
    return {
      sucesso: false,
      mensagem: 'Não foi possível confirmar o e-mail. Tente novamente.',
    }
  }
}
