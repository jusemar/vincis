import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, usuariosPerfis } from '@/db/schema'
import { ehGestorNosPerfis, escolherPerfilPrincipal } from '../constants/perfis'
import type { PerfilTipo } from '../types'

/**
 * As duas dimensões de uma conta, lidas de uma vez.
 *
 * `usuarios_perfis` sempre foi uma relação de muitos para muitos — o banco
 * nunca impediu que a mesma pessoa fosse Profissional e Gestor da Plataforma.
 * Quem impedia era a leitura, que colapsava o conjunto num único nome. Aqui as
 * duas perguntas são respondidas separadamente: **o que a pessoa exerce** e
 * **se ela administra a Vincis**.
 */
export type CapacidadesUsuario = {
  /** Todos os perfis vinculados, como estão no banco. */
  perfis: string[]
  /** O que a pessoa exerce: prestador ou cliente. Nunca `gestor_vincis`. */
  perfilOperacional: PerfilTipo
  ehGestor: boolean
}

export async function buscarCapacidadesUsuario(
  usuarioId: string,
): Promise<CapacidadesUsuario> {
  const vinculados = await db
    .select({ nome: perfis.nome })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .where(eq(usuariosPerfis.usuarioId, usuarioId))

  const nomes = vinculados.map(({ nome }) => nome)
  return {
    perfis: nomes,
    perfilOperacional: escolherPerfilPrincipal(nomes),
    ehGestor: ehGestorNosPerfis(nomes),
  }
}

/** O perfil operacional da conta. Atalho para quem só precisa dele. */
export async function buscarPerfilPrincipalUsuario(
  usuarioId: string,
): Promise<PerfilTipo> {
  return (await buscarCapacidadesUsuario(usuarioId)).perfilOperacional
}
