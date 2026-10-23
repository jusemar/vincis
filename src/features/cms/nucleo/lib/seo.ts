/**
 * Metadados de SEO de uma página publicada, sem depender de framework.
 *
 * Título: o de SEO quando preenchido; senão o da página com o nome do site.
 * Descrição: só a de SEO — sem ela, quem chama mantém a descrição padrão do
 * site em vez de inventar uma. Canonical só existe com a URL base do site
 * configurada: canonical relativo apontaria para o host errado.
 */
export type DadosSeoPagina = {
  titulo: string
  slug: string
  tituloSeo: string | null
  descricaoSeo: string | null
}

export type SeoPagina = {
  titulo: string
  descricao: string | null
  canonical: string | null
  openGraph: {
    type: 'article'
    title: string
    description: string | null
    url: string | null
    siteName: string
    locale: string
  }
}

export function montarSeoPagina(
  pagina: DadosSeoPagina,
  site: { nome: string; urlBase: string | null; idioma: string },
): SeoPagina {
  const titulo = pagina.tituloSeo?.trim() || `${pagina.titulo} | ${site.nome}`
  const descricao = pagina.descricaoSeo?.trim() || null
  const canonical = site.urlBase ? new URL(`/${pagina.slug}`, site.urlBase).toString() : null
  return {
    titulo,
    descricao,
    canonical,
    openGraph: {
      type: 'article',
      title: titulo,
      description: descricao,
      url: canonical,
      siteName: site.nome,
      locale: site.idioma,
    },
  }
}
