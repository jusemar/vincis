import type { AcessoUsuario } from '../queries/obter-destino-apos-login'
import type { DadosUsuarioAutenticado } from '../types'

/**
 * O único lugar que monta a identidade enviada ao navegador.
 *
 * ## Por que uma função, e não quatro objetos literais
 *
 * Porque eram quatro: `/api/auth/login`, `/api/auth/sessao`,
 * `autenticar-usuario` e `obter-usuario-autenticado` montavam o mesmo DTO à
 * mão, cada um dentro de um `NextResponse.json({...})` que o TypeScript não
 * confere. Quando a conta do Gestor passou a carregar `ehGestor` ao lado do
 * perfil operacional, três lugares foram atualizados e um ficou para trás — e
 * o que ficou para trás era justamente o do login. O resultado: quem entrava
 * recebia `perfilTipo: 'profissional'` sem `ehGestor`, o menu concluía que
 * ninguém ali administrava a plataforma, e o grupo "Gestão da Plataforma"
 * sumia até a próxima recarga completa da página.
 *
 * Com um montador tipado, esquecer um campo deixa de ser possível: acrescentar
 * uma capacidade nova ao DTO quebra a compilação de quem não a fornece.
 *
 * ## O que vai, e o que não vai
 *
 * Vai o mínimo que a interface precisa para se desenhar: quem é a pessoa e o
 * que ela exerce e administra. Não vai token, senha, nem qualquer coisa que
 * autorize — a marca `ehGestor` decide o que **aparece**, e nunca o que passa:
 * cada porta continua sendo fechada no servidor.
 */
export type ContaAutenticada = {
  id: string
  nome: string
  email: string
  whatsapp: string | null
  status: DadosUsuarioAutenticado['status']
}

export function montarUsuarioAutenticado(
  conta: ContaAutenticada,
  acesso: Pick<AcessoUsuario, 'perfil' | 'ehGestor'>,
): DadosUsuarioAutenticado {
  return {
    id: conta.id,
    nome: conta.nome,
    email: conta.email,
    whatsapp: conta.whatsapp,
    status: conta.status,
    /** O que a pessoa exerce. Nunca `gestor_vincis`. */
    perfilTipo: acesso.perfil,
    /** O que ela administra. Dimensão independente do perfil. */
    ehGestor: acesso.ehGestor,
  }
}
