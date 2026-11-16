import type { FilterState } from '../types/profissionais'

/**
 * Filtros da busca de profissionais que podem chegar pela URL.
 *
 * - `?area=contabilidade` | `?area=advocacia` — abre a busca já filtrada pela
 *   profissão (links "Contabilidade" e "Assistência Jurídica" do rodapé);
 * - `?orcamento=1` — abre o pedido de orçamento expandido (link "Serviços
 *   Avulsos").
 *
 * Valor desconhecido é ignorado: a busca abre sem filtro, como sempre.
 */
export const AREAS_BUSCA = ['contabilidade', 'advocacia'] as const
export type AreaBusca = (typeof AREAS_BUSCA)[number]

/** De-para da área da URL para a profissão da barra de filtros. */
const PROFISSAO_DA_AREA: Record<AreaBusca, FilterState['profession']> = {
  contabilidade: 'contador',
  advocacia: 'advogado',
}

export function lerAreaBusca(valor: string | string[] | undefined): AreaBusca | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor
  return (AREAS_BUSCA as readonly string[]).includes(texto ?? '') ? (texto as AreaBusca) : undefined
}

export function lerAbrirOrcamento(valor: string | string[] | undefined): boolean {
  return (Array.isArray(valor) ? valor[0] : valor) === '1'
}

export function profissaoDaArea(area: AreaBusca | undefined): FilterState['profession'] | undefined {
  return area ? PROFISSAO_DA_AREA[area] : undefined
}
