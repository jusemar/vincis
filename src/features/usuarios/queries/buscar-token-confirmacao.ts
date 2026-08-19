import { and, eq, isNull, gt } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '@/db/connection'
import { tokensUsuario } from '@/db/schema'

export type DadosTokenConfirmacao = {
  id: string
  usuarioId: string
}

export async function buscarTokenConfirmacaoValido(token: string): Promise<DadosTokenConfirmacao | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const resultado = await db
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

  return resultado[0] ?? null
}
