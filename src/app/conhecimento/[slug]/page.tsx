import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PaginaArtigo } from '@/features/conhecimento/components/publico/PaginaArtigo'
import { montarDadosEstruturadosArtigo, montarMetadadosArtigo } from '@/features/conhecimento/lib/seo-artigo'
import { listarArtigosRelacionados, obterArtigoPublicado } from '@/features/conhecimento/queries/publico'
import { DadosEstruturados } from '@/features/seo'

type Propriedades = { params: Promise<{ slug: string }> }

/**
 * Lida a cada requisição: despublicar tira o artigo do ar imediatamente, sem
 * depender de expiração de cache.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Propriedades): Promise<Metadata> {
  const artigo = await obterArtigoPublicado((await params).slug)
  return artigo ? montarMetadadosArtigo(artigo) : { robots: { index: false, follow: true } }
}

/** `/conhecimento/<slug>` — artigo publicado (só a versão aprovada). */
export default async function ArtigoRoute({ params }: Propriedades) {
  const artigo = await obterArtigoPublicado((await params).slug)
  if (!artigo) notFound()
  const relacionados = await listarArtigosRelacionados({ id: artigo.id, categoriaId: artigo.categoriaCompleta?.id ?? null })
  return (
    <>
      <DadosEstruturados dados={montarDadosEstruturadosArtigo(artigo)} />
      <PaginaArtigo artigo={artigo} relacionados={relacionados} />
    </>
  )
}
