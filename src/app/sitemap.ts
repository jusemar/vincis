import type { MetadataRoute } from 'next'
import { montarSitemap } from '@/features/seo'

/**
 * `/sitemap.xml` — convenção nativa do Next.js.
 *
 * Lido a cada requisição: sem isto o Next geraria o XML no `build`, com o
 * banco da máquina que compilou, e perfis publicados depois só apareceriam no
 * deploy seguinte. A montagem vive em `features/seo`.
 */
export const dynamic = 'force-dynamic'

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return montarSitemap()
}
