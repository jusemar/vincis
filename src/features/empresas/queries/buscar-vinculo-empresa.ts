import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, empresas } from '@/db/schema'
import type { ContextoEmpresa } from '../types'

export async function buscarVinculoAtivoEmpresa(
  usuarioId: string,
  empresaId: string,
): Promise<ContextoEmpresa | null> {
  const [contexto] = await db
    .select({
      empresaId: empresas.id,
      membroId: empresaMembros.id,
      nome: empresas.nome,
      segmento: empresas.segmento,
    })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(
      and(
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.status, 'ativo'),
        eq(empresas.status, 'ativo'),
      ),
    )
    .limit(1)

  return contexto ?? null
}
