import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import { buscarSessaoAtiva } from '@/features/usuarios/queries/buscar-sessao-ativa'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'

export async function obterIdentidadeSessao(token: string): Promise<string | null> {
  if (!token) return null

  const sessao = await buscarSessaoAtiva(token)
  if (!sessao) return null

  const [usuario] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.id, sessao.usuarioId),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
      ),
    )
    .limit(1)

  return usuario?.id ?? null
}
