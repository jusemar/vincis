import { cache } from 'react'
import { redirect } from 'next/navigation'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { obterDadosCliente } from '../queries/obter-dados-cliente'
import { ROTA_CLIENTE } from '../constants/navegacao'
import type { DadosPortalCliente } from '../types/portal'

export type ClienteAutenticado = {
  usuarioId: string
  dados: DadosPortalCliente
}

/**
 * A porta da Área do Cliente, num lugar só.
 *
 * A guarda repete o padrão das demais rotas protegidas: a resolução central
 * decide o que cada conta alcança, e a área só abre para quem tem `/cliente`
 * entre as suas. Um prestador que digitar a URL é devolvido ao próprio destino;
 * o Gestor da Plataforma entra, porque administrar a Vincis não tira dele o
 * direito de contratar.
 *
 * ## Por que `cache`
 *
 * Agora cada área é uma página, e o layout também precisa da sessão — para
 * fechar a porta antes de qualquer conteúdo montar. Sem memória, uma visita
 * faria a mesma conferência duas vezes (layout e página) e pagaria duas vezes
 * pelas consultas. `cache` do React vale por requisição: a segunda chamada
 * devolve o resultado da primeira, e nada é compartilhado entre pessoas.
 *
 * Continua sendo a barreira real. O `proxy.ts` já barra quem não pode abrir
 * `/cliente`, mas middleware não é autorização — esta função relê sessão e
 * acesso no banco a cada requisição.
 */
export const obterClienteDaSessao = cache(
  async (): Promise<ClienteAutenticado | null> => {
    const usuario = await obterSessaoServidor()
    if (!usuario) return null

    const acesso = await resolverAcessoUsuario(usuario.id)
    if (!acesso || !acesso.areasPermitidas.includes(ROTA_CLIENTE)) return null

    const dados = await obterDadosCliente(usuario.id)
    if (!dados) return null

    return { usuarioId: usuario.id, dados }
  },
)

/**
 * O mesmo, interrompendo a renderização de quem não passa.
 *
 * Quem não tem sessão vai para o login; quem tem sessão mas não alcança esta
 * área volta para o próprio destino, resolvido pela mesma função de sempre.
 */
export async function exigirClienteDaSessao(): Promise<ClienteAutenticado> {
  const cliente = await obterClienteDaSessao()
  if (cliente) return cliente

  const usuario = await obterSessaoServidor()
  if (!usuario) redirect('/?entrar=1')

  const acesso = await resolverAcessoUsuario(usuario.id)
  redirect(acesso?.destino ?? '/')
}
