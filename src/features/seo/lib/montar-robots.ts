import type { MetadataRoute } from 'next'
import { CAMINHOS_NAO_RASTREAVEIS, URL_CANONICA_SITE } from '../constants/indexacao'

/** robots.txt: tudo público liberado, áreas privadas fora, sitemap anunciado. */
export function montarRobots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...CAMINHOS_NAO_RASTREAVEIS] },
    sitemap: new URL('/sitemap.xml', URL_CANONICA_SITE).toString(),
  }
}
