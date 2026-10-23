/**
 * Etiquetas de cache do CMS.
 *
 * A leitura pública (rodapé, página por slug) fica em cache etiquetado, e cada
 * mutação invalida só o que mudou — nunca o site inteiro. Navegação tem uma
 * etiqueta; cada página tem a sua, pelo slug, que é como o visitante a pede.
 */
export const TAG_CMS_NAVEGACAO = 'cms-navegacao'

/**
 * Conjunto de slugs publicados. A rota pública só consulta (e guarda em cache)
 * uma página cujo slug está neste conjunto: um endereço inventado não cria
 * entrada de cache nenhuma.
 */
export const TAG_CMS_PAGINAS_PUBLICADAS = 'cms-paginas-publicadas'

export function tagCmsPagina(slug: string) {
  return `cms-pagina:${slug}`
}
