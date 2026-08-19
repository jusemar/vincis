import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'

export type DadosUsuarioPorEmail = {
  id: string
  nome: string
  email: string
  senhaHash: string
  status: string
}

export async function buscarUsuarioPorEmail(email: string): Promise<DadosUsuarioPorEmail | null> {
  const resultado = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      senhaHash: usuarios.senhaHash,
      status: usuarios.status,
    })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1)

  return resultado[0] ?? null
}
