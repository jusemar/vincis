/**
 * Endereços da Central de Conhecimento — arquivo puro (cliente e servidor).
 *
 * `/conhecimento/previa/<id>` é privado (sessão + autor ou Gestor), `noindex`
 * e bloqueado no robots.txt. Por isso `previa` não pode ser slug de artigo.
 */
export const ROTA_CONHECIMENTO = '/conhecimento'
export const ROTA_MEUS_ARTIGOS = '/admin/artigos'
export const ROTA_GESTAO_CONHECIMENTO = '/admin/conhecimento'

export const ROTULO_MEUS_ARTIGOS = 'Meus artigos'

/** Slugs que um artigo nunca pode ocupar (segmentos fixos de `/conhecimento/*`). */
export const SLUGS_RESERVADOS_ARTIGO = new Set(['previa', 'categoria', 'busca', 'pagina', 'rss', 'feed'])

export function caminhoArtigo(slug: string): string {
  return `${ROTA_CONHECIMENTO}/${encodeURIComponent(slug)}`
}

export function caminhoPreviaArtigo(artigoId: string): string {
  return `${ROTA_CONHECIMENTO}/previa/${encodeURIComponent(artigoId)}`
}

export function caminhoCategoria(slug: string): string {
  return `${ROTA_CONHECIMENTO}?categoria=${encodeURIComponent(slug)}`
}

export function caminhoEdicaoArtigo(artigoId: string): string {
  return `${ROTA_MEUS_ARTIGOS}/${encodeURIComponent(artigoId)}`
}

export function caminhoModeracaoArtigo(artigoId: string): string {
  return `${ROTA_GESTAO_CONHECIMENTO}/artigos/${encodeURIComponent(artigoId)}`
}
