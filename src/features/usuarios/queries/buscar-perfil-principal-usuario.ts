import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, usuariosPerfis } from '@/db/schema'
import { escolherPerfilPrincipal } from '../constants/perfis'
import type { PerfilTipo } from '../types'

export async function buscarPerfilPrincipalUsuario(usuarioId: string): Promise<PerfilTipo> {
  const perfisVinculados = await db
    .select({ nome: perfis.nome })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .where(eq(usuariosPerfis.usuarioId, usuarioId))

  return escolherPerfilPrincipal(perfisVinculados.map(({ nome }) => nome))
}
