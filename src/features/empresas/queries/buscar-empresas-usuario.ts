import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, empresas } from '@/db/schema'
import type { ContextoEmpresa } from '../types'

/**
 * Escritórios ativos em que o usuário tem vínculo ativo.
 *
 * A ordenação é determinística (vínculo mais antigo primeiro) para que quem
 * participa de mais de uma equipe abra sempre no mesmo contexto, em vez de
 * depender da ordem física das linhas.
 */
export async function buscarEmpresasAtivasUsuario(
  usuarioId: string,
  limite = 2,
): Promise<ContextoEmpresa[]> {
  return db
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
        eq(empresaMembros.status, 'ativo'),
        eq(empresas.status, 'ativo'),
      ),
    )
    .orderBy(asc(empresaMembros.createdAt), asc(empresas.nome), asc(empresas.id))
    .limit(limite)
}
