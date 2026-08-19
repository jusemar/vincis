import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import type { DadosPortalCliente } from '../components/PortalClientePage'

/** Dados da própria conta do Cliente. Só o que a área dele precisa exibir. */
export async function obterDadosCliente(
  usuarioId: string,
): Promise<DadosPortalCliente | null> {
  const [usuario] = await db
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
      criadoEm: usuarios.createdAt,
    })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)

  if (!usuario) return null
  return { ...usuario, criadoEm: usuario.criadoEm.toISOString() }
}
