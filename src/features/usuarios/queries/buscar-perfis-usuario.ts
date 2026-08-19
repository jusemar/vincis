import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuariosPerfis } from '@/db/schema'
import { perfis } from '@/db/schema'
import type { PerfilUsuario } from '../types/permissoes'

export async function buscarPerfisUsuario(usuarioId: string): Promise<PerfilUsuario[]> {
  const resultado = await db
    .select({
      perfilId: perfis.id,
      nomePerfil: perfis.nome,
    })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .where(eq(usuariosPerfis.usuarioId, usuarioId))

  return resultado
}
