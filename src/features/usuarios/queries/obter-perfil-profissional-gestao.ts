import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { ocupacaoDoContador } from '@/features/assinaturas/queries/carteira-do-contador'

export async function obterPerfilProfissionalGestao(usuarioId: string) {
  const [resultado] = await db.select({ usuario: { id: usuarios.id, nome: usuarios.nome, email: usuarios.email, whatsapp: usuarios.whatsapp }, perfil: perfisProfissionais })
    .from(usuarios).leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id)).where(eq(usuarios.id, usuarioId)).limit(1)
  if (!resultado) return null
  // Ocupação (ativos + reservas) para o card de capacidade — só no contador parceiro Vincis.
  const ocupacao = resultado.perfil?.modeloContratacao === 'vincis'
    ? await ocupacaoDoContador(usuarioId)
    : { ativos: 0, reservados: 0, ocupados: 0 }
  return { ...resultado, ocupacao }
}
