import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'

export async function obterPerfilProfissionalGestao(usuarioId: string) {
  const [resultado] = await db.select({ usuario: { id: usuarios.id, nome: usuarios.nome, email: usuarios.email, whatsapp: usuarios.whatsapp }, perfil: perfisProfissionais })
    .from(usuarios).leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id)).where(eq(usuarios.id, usuarioId)).limit(1)
  return resultado ?? null
}

