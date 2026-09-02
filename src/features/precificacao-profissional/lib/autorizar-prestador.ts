import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'

/**
 * Quem pode configurar a própria tabela de preços.
 *
 * ## A identidade nunca vem do formulário
 *
 * Esta função devolve **a conta da sessão**, e é ela que as actions usam como
 * dono dos valores gravados. Nenhuma action aceita um `profissionalId` no
 * corpo: se aceitasse, "editar apenas os próprios preços" viraria uma regra que
 * depende de o cliente mandar o id certo. Não havendo o parâmetro, não há o que
 * forjar.
 *
 * ## Prestador habilitado, e não "logado"
 *
 * A resposta é relida do banco (`resolverAcessoUsuario`), como em toda porta de
 * servidor da plataforma: a rota e o menu já barram antes, e nenhuma das duas
 * coisas protege quem chama a action direto. Cliente e Gestor sem cadastro de
 * prestador não têm perfil público onde publicar preço, e param aqui.
 *
 * O Gestor da Vincis que também é Profissional passa — pela porta de
 * Profissional, e para gravar na tabela **dele**. Administrar a plataforma não
 * dá a ninguém acesso à tabela individual de outra pessoa, e a precificação
 * oficial continua saindo por outro caminho, com outra guarda.
 */
export async function autorizarPrestador() {
  const usuario = await obterSessaoServidor()
  if (!usuario) return null

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || !acesso.tipoPrestador || !acesso.habilitado) return null

  return usuario
}
