import { eq, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'

export type DadosUsuarioLogin = {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  senhaHash: string
  status: string
  emailVerificado: boolean
  whatsappVerificado: boolean
}

export async function buscarUsuarioPorLogin(emailOuWhatsapp: string): Promise<DadosUsuarioLogin | null> {
  const resultado = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
      senhaHash: usuarios.senhaHash,
      status: usuarios.status,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
    })
    .from(usuarios)
    .where(
      or(
        eq(usuarios.email, emailOuWhatsapp),
        eq(usuarios.whatsapp, emailOuWhatsapp),
      ),
    )
    .limit(1)

  return resultado[0] ?? null
}
