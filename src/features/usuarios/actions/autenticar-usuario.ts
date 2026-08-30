import { LoginSchema, type LoginDTO } from '../schemas/login'
import { buscarUsuarioPorLogin } from '../queries/buscar-usuario-por-login'
import { compararHash } from '../lib/hash-senha'
import { contaVerificada } from '../lib/verificacao-conta'
import { montarUsuarioAutenticado } from '../lib/dados-usuario-autenticado'
import { buscarCapacidadesUsuario } from '../queries/buscar-perfil-principal-usuario'
import type { ResultadoLogin, DadosUsuarioAutenticado } from '../types'

export async function autenticarUsuario(dados: LoginDTO): Promise<ResultadoLogin> {
  const validated = LoginSchema.safeParse(dados)

  if (!validated.success) {
    return {
      sucesso: false,
      mensagem: 'Credenciais inválidas',
    }
  }

  const { emailOuWhatsapp, senha } = validated.data

  const usuario = await buscarUsuarioPorLogin(emailOuWhatsapp)

  if (!usuario) {
    return {
      sucesso: false,
      mensagem: 'Credenciais inválidas',
    }
  }

  const senhaValida = await compararHash(senha, usuario.senhaHash)

  if (!senhaValida) {
    return {
      sucesso: false,
      mensagem: 'Credenciais inválidas',
    }
  }

  if (usuario.status === 'pendente_email') {
    return {
      sucesso: false,
      mensagem: 'E-mail não confirmado',
    }
  }

  if (usuario.status === 'bloqueado') {
    return {
      sucesso: false,
      mensagem: 'Usuário bloqueado',
    }
  }

  if (!contaVerificada(usuario)) {
    return {
      sucesso: false,
      mensagem: 'Conta ainda não verificada',
    }
  }

  const { perfilOperacional, ehGestor } = await buscarCapacidadesUsuario(
    usuario.id,
  )

  const usuarioAutenticado = montarUsuarioAutenticado(
    { ...usuario, status: usuario.status as DadosUsuarioAutenticado['status'] },
    { perfil: perfilOperacional, ehGestor },
  )

  return {
    sucesso: true,
    mensagem: 'Autenticado com sucesso',
    usuario: usuarioAutenticado,
  }
}
