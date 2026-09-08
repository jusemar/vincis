import { PainelDePagamento } from '@/features/pagamentos/components/PainelDePagamento'
import {
  SolicitacoesCliente,
  type FiltroSolicitacoes,
} from '@/features/portal-cliente/components/secoes/SolicitacoesCliente'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'

/**
 * Orçamentos: as solicitações do Cliente e as propostas recebidas.
 *
 * `?filtro=` e `?pagar=` continuam sendo query, e é o que devem ser: são
 * parâmetros **desta** página, não escolha de página. `pagar` abre o pagamento
 * daquela solicitação — um recorte da própria área, e não um destino à parte,
 * porque o pagamento pertence à solicitação e sair dele devolve para a lista.
 */
export default async function OrcamentosRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { usuarioId } = await exigirClienteDaSessao()

  const parametros = await searchParams
  const texto = (chave: string) => {
    const valor = parametros[chave]
    return Array.isArray(valor) ? valor[0] : valor
  }

  const oportunidades = await listarOportunidadesDoCliente(usuarioId)

  // Só encontra o que já pertence a quem está logado: a lista veio da consulta
  // recortada por dono. Um id de outra pessoa não casa e a página volta à lista.
  const pagar = texto('pagar')
  const emPagamento = pagar
    ? (oportunidades.find((item) => item.id === pagar) ?? null)
    : null

  if (emPagamento) return <PainelDePagamento oportunidade={emPagamento} />

  return (
    <SolicitacoesCliente
      oportunidades={oportunidades}
      filtro={(texto('filtro') ?? 'todas') as FiltroSolicitacoes}
    />
  )
}
