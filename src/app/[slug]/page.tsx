import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PaginaPublicaCms } from '@/features/cms/components/publico/PaginaPublicaCms'
import { SITE_CMS, urlBaseDoSite } from '@/features/cms/integracao/site'
import { montarSeoPagina } from '@/features/cms/nucleo/lib/seo'
import { buscarPaginaPublicada } from '@/features/cms/queries/publico'

/**
 * Página institucional do CMS em `/<slug>`.
 *
 * Só página publicada abre. Slug inexistente, rascunho, arquivada ou reservado
 * respondem o 404 oficial do Next — o mesmo para todos, sem revelar que um
 * rascunho existe. As rotas reais da Vincis têm precedência sobre esta
 * dinâmica, e o CMS nem aceita gravar slug que colida com elas.
 */
type Propriedades = { params: Promise<{ slug: string }> }

// Metadata e página pedem a mesma leitura: uma consulta por requisição.
const buscar = cache(buscarPaginaPublicada)

export async function generateMetadata({ params }: Propriedades): Promise<Metadata> {
  const pagina = await buscar((await params).slug)
  if (!pagina) return {}

  const seo = montarSeoPagina(pagina, { ...SITE_CMS, urlBase: urlBaseDoSite() })
  return {
    title: seo.titulo,
    ...(seo.descricao ? { description: seo.descricao } : {}),
    ...(seo.canonical ? { alternates: { canonical: seo.canonical } } : {}),
    openGraph: {
      type: seo.openGraph.type,
      title: seo.openGraph.title,
      siteName: seo.openGraph.siteName,
      locale: seo.openGraph.locale,
      ...(seo.openGraph.description ? { description: seo.openGraph.description } : {}),
      ...(seo.openGraph.url ? { url: seo.openGraph.url } : {}),
    },
  }
}

export default async function PaginaCmsRoute({ params }: Propriedades) {
  const pagina = await buscar((await params).slug)
  if (!pagina) notFound()
  return <PaginaPublicaCms pagina={pagina} />
}
