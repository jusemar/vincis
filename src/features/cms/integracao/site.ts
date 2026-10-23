/**
 * Dados do site usados no SEO das páginas do CMS.
 *
 * A URL base vem de `APP_URL`, a mesma variável que os e-mails e os links de
 * indicação já usam. Sem ela (ou com valor inválido) não há canonical — melhor
 * nenhum do que um apontando para o host errado.
 */
export const SITE_CMS = { nome: 'Vincis', idioma: 'pt_BR' } as const

export function urlBaseDoSite(): string | null {
  const valor = process.env.APP_URL?.trim()
  if (!valor) return null
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}
