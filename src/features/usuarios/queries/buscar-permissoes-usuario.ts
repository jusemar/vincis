import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuariosPerfis, perfis, perfisPermissoes, permissoes } from '@/db/schema'
import type { PermissaoUsuario } from '../types/permissoes'

export async function buscarPermissoesUsuario(usuarioId: string): Promise<PermissaoUsuario[]> {
  const resultado = await db
    .select({
      permissaoId: permissoes.id,
      nome: permissoes.nome,
    })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .innerJoin(perfisPermissoes, eq(perfisPermissoes.perfilId, perfis.id))
    .innerJoin(permissoes, eq(permissoes.id, perfisPermissoes.permissaoId))
    .where(eq(usuariosPerfis.usuarioId, usuarioId))

  const vistas = new Set<string>()
  const distinct: PermissaoUsuario[] = []

  for (const item of resultado) {
    if (!vistas.has(item.nome)) {
      vistas.add(item.nome)
      distinct.push(item)
    }
  }

  return distinct
}
