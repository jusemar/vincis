import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import { buscarSessaoAtiva } from '../queries/buscar-sessao-ativa'
import type { ResultadoPadrao, DadosUsuarioAutenticado } from '../types'
import { montarUsuarioAutenticado } from '../lib/dados-usuario-autenticado'
import { buscarCapacidadesUsuario } from '../queries/buscar-perfil-principal-usuario'

export type ResultadoUsuarioAutenticado = ResultadoPadrao & {
  usuario?: DadosUsuarioAutenticado
}

export async function obterUsuarioAutenticado(token: string): Promise<ResultadoUsuarioAutenticado> {
  if (!token) {
    return {
      sucesso: false,
      mensagem: 'Token inválido',
    }
  }

  const sessao = await buscarSessaoAtiva(token)

  if (!sessao) {
    return {
      sucesso: false,
      mensagem: 'Sessão inválida ou expirada',
    }
  }

  const [usuario] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
      status: usuarios.status,
    })
    .from(usuarios)
    .where(eq(usuarios.id, sessao.usuarioId))
    .limit(1)

  if (!usuario) {
    return {
      sucesso: false,
      mensagem: 'Usuário não encontrado',
    }
  }

  const { perfilOperacional, ehGestor } = await buscarCapacidadesUsuario(
    usuario.id,
  )

  return {
    sucesso: true,
    mensagem: 'Usuário autenticado',
    usuario: montarUsuarioAutenticado(
      { ...usuario, status: usuario.status as DadosUsuarioAutenticado['status'] },
      { perfil: perfilOperacional, ehGestor },
    ),
  }
}
