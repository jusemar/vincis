import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, perfisProfissionais, usuarios, usuariosPerfis } from '@/db/schema'
import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import { ocupacaoDoContador } from '@/features/assinaturas/queries/carteira-do-contador'

export async function obterPerfilProfissionalGestao(usuarioId: string) {
  const [resultado] = await db.select({ usuario: { id: usuarios.id, nome: usuarios.nome, email: usuarios.email, whatsapp: usuarios.whatsapp, identidadePublica: usuarios.identidadePublica }, perfil: perfisProfissionais })
    .from(usuarios).leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id)).where(eq(usuarios.id, usuarioId)).limit(1)
  if (!resultado) return null
  // Ocupação (ativos + reservas) para o card de capacidade — só no contador parceiro Vincis.
  const ocupacao = resultado.perfil?.modeloContratacao === 'vincis'
    ? await ocupacaoDoContador(usuarioId)
    : { ativos: 0, reservados: 0, ocupados: 0 }
  // Só conta com perfil de Gestor pode assinar como equipe Vincis.
  const [gestor] = await db
    .select({ id: usuariosPerfis.usuarioId })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .where(and(eq(usuariosPerfis.usuarioId, usuarioId), eq(perfis.nome, PERFIL_GESTOR_VINCIS)))
    .limit(1)
  return { ...resultado, ocupacao, ehGestor: Boolean(gestor) }
}
