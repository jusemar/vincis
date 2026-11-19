import { cache } from 'react'
import { obterPrestadorPeloSlug } from '../lib/slug-perfil'

/** Mesma leitura para `generateMetadata` e a página: uma consulta por requisição. */
export const obterPrestadorPeloSlugDaRequisicao = cache(async (slugBruto: string) => {
  let slug: string
  try {
    slug = decodeURIComponent(slugBruto).toLowerCase()
  } catch {
    return null
  }
  return obterPrestadorPeloSlug(slug)
})
