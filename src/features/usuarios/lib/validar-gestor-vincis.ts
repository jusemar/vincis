import { obterSessaoServidor } from './sessao-servidor'
import { resolverAcessoUsuario } from '../queries/obter-destino-apos-login'
import { ehGestorPlataforma } from './gestor-plataforma'

/**
 * Porta da Gestão da plataforma, no servidor.
 *
 * A área deixou de ter rota própria — os recursos da Gestão vivem dentro de
 * `/admin` —, então a guarda não se apoia no destino da rota: quem distingue o
 * Gestor de qualquer outro administrador é o perfil, conferido duas vezes
 * (sessão e resolução central, que também exige conta ativa e verificada).
 * `/admin` é destino comum; é esta função que fecha o que é exclusivo.
 *
 * A pergunta "é Gestor?" não é respondida aqui: vem de `ehGestorPlataforma`,
 * a mesma que o middleware e o menu usam. Aqui ficam a leitura da sessão e a
 * releitura do perfil no banco — o que uma resposta de servidor não pode
 * dispensar.
 */
export async function validarGestorVincis() {
  const usuario = await obterSessaoServidor()
  if (!usuario || !ehGestorPlataforma(usuario)) return null

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!ehGestorPlataforma(acesso)) return null

  return usuario
}
