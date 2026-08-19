import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import { obterSessaoServidor } from './sessao-servidor'
import { resolverAcessoUsuario } from '../queries/obter-destino-apos-login'

export async function validarGestorVincis() {
  const usuario = await obterSessaoServidor()
  if (!usuario || usuario.perfilTipo !== PERFIL_GESTOR_VINCIS) return null

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || acesso.destino !== '/gestao') return null

  return usuario
}
