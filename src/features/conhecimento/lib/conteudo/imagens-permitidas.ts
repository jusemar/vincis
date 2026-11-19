/**
 * De onde uma imagem de artigo (capa ou corpo) pode vir — arquivo puro.
 *
 * Só do storage público da própria Vincis, na pasta da Central:
 * - localhost: `/api/armazenamento-local/conhecimento/...` (driver local);
 * - online: `https://<store>.public.blob.vercel-storage.com/conhecimento/...`.
 *
 * Toda imagem chega por `enviarImagemArtigo`, que valida formato, assinatura e
 * tamanho. Aceitar URL de terceiros permitiria trocar a imagem depois da
 * aprovação e rastrear leitores — por isso não há campo "colar URL".
 */
export const PASTA_IMAGENS_CONHECIMENTO = 'conhecimento'

const PREFIXO_LOCAL = `/api/armazenamento-local/${PASTA_IMAGENS_CONHECIMENTO}/`
const SUFIXO_BLOB_PUBLICO = '.public.blob.vercel-storage.com'

export function ehImagemDeArtigoPermitida(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith(PREFIXO_LOCAL)) return !url.includes('..')
  try {
    const endereco = new URL(url)
    return (
      endereco.protocol === 'https:' &&
      endereco.hostname.endsWith(SUFIXO_BLOB_PUBLICO) &&
      endereco.pathname.startsWith(`/${PASTA_IMAGENS_CONHECIMENTO}/`)
    )
  } catch {
    return false
  }
}
