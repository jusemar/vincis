import { redirect } from 'next/navigation'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { PortalClientePage } from '@/features/portal-cliente/components/PortalClientePage'
import { obterDadosCliente } from '@/features/portal-cliente/queries/obter-dados-cliente'
import { listarMinhasContratacoes } from '@/features/servicos/actions/contratacoes'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'

/**
 * Área autenticada do Cliente.
 *
 * A guarda repete o padrão das demais rotas protegidas: a resolução central
 * decide para onde cada pessoa vai, e a página só abre quando o destino
 * resolvido é exatamente esta rota. Um prestador ou o Gestor que digitarem
 * `/cliente` são devolvidos ao próprio destino.
 */
export default async function ClienteRoute() {
  const usuario = await obterSessaoServidor()
  if (!usuario) redirect('/?entrar=1')

  const acesso = await resolverAcessoUsuario(usuario.id)
  if (!acesso || acesso.destino !== '/cliente') redirect(acesso?.destino ?? '/')

  const dados = await obterDadosCliente(usuario.id)
  if (!dados) redirect('/')

  const contratacoes = await listarMinhasContratacoes()
  // Recorte do Cliente: só os atendimentos dele, sem conversa interna nem
  // eventos internos — o filtro acontece no SQL da consulta.
  const atendimentos = await listarAtendimentosDoCliente(usuario.id)

  return (
    <PortalClientePage
      dados={dados}
      contratacoes={contratacoes.dados ?? []}
      atendimentos={atendimentos}
    />
  )
}
