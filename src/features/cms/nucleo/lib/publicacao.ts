import type { StatusPagina } from '../types'

/**
 * Regras de ciclo de vida de uma página.
 *
 * Três estados e quatro movimentos: publicar (rascunho → publicada),
 * despublicar (publicada → rascunho), arquivar (rascunho ou publicada →
 * arquivada). Arquivada é o fim da linha nesta versão — é como o CMS
 * "exclui" sem apagar, e o slug continua reservado.
 */
export type TransicaoPagina = 'publicar' | 'despublicar' | 'arquivar'

const ORIGENS_PERMITIDAS: Record<TransicaoPagina, readonly StatusPagina[]> = {
  publicar: ['rascunho'],
  despublicar: ['publicada'],
  arquivar: ['rascunho', 'publicada'],
}

const DESTINO: Record<TransicaoPagina, StatusPagina> = {
  publicar: 'publicada',
  despublicar: 'rascunho',
  arquivar: 'arquivada',
}

/** Status resultante, ou `null` quando o movimento não vale a partir daqui. */
export function aplicarTransicao(
  atual: StatusPagina,
  transicao: TransicaoPagina,
): StatusPagina | null {
  return ORIGENS_PERMITIDAS[transicao].includes(atual) ? DESTINO[transicao] : null
}

/** Página arquivada não é editável: o conteúdo dela é registro, não rascunho. */
export function paginaEhEditavel(status: StatusPagina) {
  return status !== 'arquivada'
}

/** Página arquivada não entra em grupo de navegação. */
export function paginaPodeSerAssociada(status: StatusPagina) {
  return status !== 'arquivada'
}

export function filtrarPaginasAssociaveis<T extends { id: string; status: StatusPagina }>(
  paginas: readonly T[],
  idsJaAssociados: Iterable<string>,
): T[] {
  const associados = new Set(idsJaAssociados)
  return paginas.filter(
    (pagina) => paginaPodeSerAssociada(pagina.status) && !associados.has(pagina.id),
  )
}

/**
 * Data de publicação a gravar.
 *
 * A primeira publicação fixa a data; republicar depois de despublicar não a
 * reescreve. É a data em que a página nasceu para o público.
 */
export function resolverPublicadaEm(anterior: Date | null, agora: Date) {
  return anterior ?? agora
}
