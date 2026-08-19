import { eq } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '@/db/connection'
import { sessoesUsuario } from '@/db/schema'
import type { ResultadoPadrao } from '../types'

export async function encerrarSessao(token: string): Promise<ResultadoPadrao> {
  if (!token) {
    return {
      sucesso: false,
      mensagem: 'Token inválido',
    }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  const [sessao] = await db
    .select({ id: sessoesUsuario.id })
    .from(sessoesUsuario)
    .where(eq(sessoesUsuario.tokenHash, tokenHash))
    .limit(1)

  if (!sessao) {
    return {
      sucesso: false,
      mensagem: 'Sessão não encontrada',
    }
  }

  await db
    .update(sessoesUsuario)
    .set({ encerradaEm: new Date() })
    .where(eq(sessoesUsuario.id, sessao.id))

  return {
    sucesso: true,
    mensagem: 'Sessão encerrada com sucesso',
  }
}
