'use server'

import { createHash } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { sessoesUsuario, tokensUsuario, usuarios } from '@/db/schema'
import { gerarHash } from '../lib/hash-senha'
import { RedefinirSenhaSchema, type RedefinirSenhaDTO } from '../schemas/redefinicao-senha'
import type { ResultadoPadrao } from '../types'

export async function redefinirSenha(dados: RedefinirSenhaDTO): Promise<ResultadoPadrao> {
  const validado = RedefinirSenhaSchema.safeParse(dados)

  if (!validado.success) {
    return {
      sucesso: false,
      mensagem: validado.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }

  const tokenHash = createHash('sha256').update(validado.data.token).digest('hex')

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
            eq(tokensUsuario.tipo, 'recuperacao_senha'),
            isNull(tokensUsuario.usadoEm),
            gt(tokensUsuario.expiraEm, new Date()),
          ),
        )
        .limit(1)
        .for('update')

      if (!tokenValido) {
        return {
          sucesso: false,
          mensagem: 'Link inválido ou expirado. Solicite uma nova recuperação de senha.',
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
          mensagem: 'Não foi possível redefinir a senha desta conta.',
        }
      }

      const agora = new Date()
      const novoHash = await gerarHash(validado.data.novaSenha)

      await tx
        .update(usuarios)
        .set({ senhaHash: novoHash, updatedAt: agora })
        .where(eq(usuarios.id, tokenValido.usuarioId))

      await tx
        .update(tokensUsuario)
        .set({ usadoEm: agora })
        .where(eq(tokensUsuario.id, tokenValido.id))

      // A troca de senha encerra todas as sessões ativas: se alguém mais tinha
      // acesso à conta, ele é derrubado junto com a senha antiga.
      await tx
        .update(sessoesUsuario)
        .set({ encerradaEm: agora })
        .where(
          and(eq(sessoesUsuario.usuarioId, tokenValido.usuarioId), isNull(sessoesUsuario.encerradaEm)),
        )

      return {
        sucesso: true,
        mensagem: 'Senha redefinida com sucesso',
      }
    })
  } catch (error) {
    console.error('[REDEFINIR_SENHA]', error)
    return {
      sucesso: false,
      mensagem: 'Não foi possível redefinir a senha. Tente novamente.',
    }
  }
}
