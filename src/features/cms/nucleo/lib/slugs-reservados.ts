/**
 * Slugs que uma página do CMS nunca pode ocupar.
 *
 * O núcleo conhece só os nomes técnicos que todo projeto Next.js tem; as rotas
 * reais de cada aplicação chegam de fora, por `criarVerificadorSlugReservado`.
 * Assim a regra "página não sequestra rota" vale em qualquer projeto sem que o
 * núcleo saiba quais rotas são.
 */
export const SLUGS_RESERVADOS_TECNICOS = [
  '_next',
  'api',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.webmanifest',
] as const

export type VerificadorSlugReservado = (slug: string) => boolean

export function criarVerificadorSlugReservado(
  rotasDaAplicacao: readonly string[],
): VerificadorSlugReservado {
  const reservados = new Set(
    [...SLUGS_RESERVADOS_TECNICOS, ...rotasDaAplicacao].map((slug) =>
      slug.trim().toLowerCase(),
    ),
  )
  return (slug) => reservados.has(slug.trim().toLowerCase())
}
