import { redirect } from 'next/navigation'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { listarConsultoriasDoCliente } from '@/features/consultorias/queries/agendamentos'
import { PortalClientePage } from '@/features/portal-cliente/components/PortalClientePage'
import type { FiltroSolicitacoes } from '@/features/portal-cliente/components/secoes/SolicitacoesCliente'
import { abaValida } from '@/features/portal-cliente/types/portal'
import { obterDadosCliente } from '@/features/portal-cliente/queries/obter-dados-cliente'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
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
export default async function ClienteRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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

  // As consultorias com hora marcada. O recorte é do SQL — `cliente_usuario_id
  // = sessão` —, então nenhuma consultoria de outra pessoa chega ao navegador.
  const consultorias = await listarConsultoriasDoCliente(usuario.id)
  // Solicitações públicas do próprio Cliente, com as propostas recebidas. O
  // recorte por dono está no SQL da consulta — comparar propostas é ato dele.
  const oportunidades = await listarOportunidadesDoCliente(usuario.id)

  // A aba vive na URL: cada área do portal tem endereço próprio e o servidor
  // renderiza o conteúdo dela — nada depende de estado no navegador para
  // aparecer.
  const parametros = await searchParams
  const texto = (chave: string) => {
    const valor = parametros[chave]
    return Array.isArray(valor) ? valor[0] : valor
  }

  return (
    <PortalClientePage
      dados={dados}
      aba={abaValida(texto('aba'))}
      filtroSolicitacoes={(texto('filtro') ?? 'todas') as FiltroSolicitacoes}
      atendimentoInicial={texto('atendimento') ?? null}
      // Deep link do acordo: `?pagar=<id>` abre a tela do pagamento daquela
      // solicitação. Quem é dono do quê continua sendo decidido pela consulta,
      // não pelo parâmetro — um id alheio simplesmente não está na lista.
      pagarOportunidade={texto('pagar') ?? null}
      contratacoes={contratacoes.dados ?? []}
      atendimentos={atendimentos}
      consultorias={consultorias.futuras}
      oportunidades={oportunidades}
    />
  )
}
