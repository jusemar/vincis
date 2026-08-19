import { and, eq, isNull, gt } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '@/db/connection'
import { sessoesUsuario } from '@/db/schema'

export type DadosSessaoAtiva = {
  id: string
  usuarioId: string
}

export async function buscarSessaoAtiva(token: string): Promise<DadosSessaoAtiva | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const resultado = await db
    .select({
      id: sessoesUsuario.id,
      usuarioId: sessoesUsuario.usuarioId,
    })
    .from(sessoesUsuario)
    .where(
      and(
        eq(sessoesUsuario.tokenHash, tokenHash),
        isNull(sessoesUsuario.encerradaEm),
        gt(sessoesUsuario.expiraEm, new Date()),
      ),
    )
    .limit(1)

  return resultado[0] ?? null
}
