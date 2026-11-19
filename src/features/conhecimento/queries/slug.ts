import { db } from '@/db/connection'
import { sugerirSlugLivre } from '../lib/edicao-artigo'
import { motivoSlugInvalido, normalizarSlugArtigo } from '../lib/slug-artigo'

export type SituacaoSlug = {
  slug: string
  disponivel: boolean
  motivo: string | null
  sugestao: string | null
}

/**
 * A URL amigável pedida está livre? Só leitura. Considera ocupado qualquer
 * slug de outro artigo, em qualquer status (arquivado também: um link antigo
 * nunca pode passar a abrir outro conteúdo).
 */
export async function conferirSlugArtigo(bruto: string, artigoId: string | null): Promise<SituacaoSlug> {
  const slug = normalizarSlugArtigo(bruto)
  const motivo = motivoSlugInvalido(slug)
  if (motivo) return { slug, disponivel: false, motivo, sugestao: null }
  const { ocupado, sugestao } = await sugerirSlugLivre(db, slug, artigoId)
  return ocupado
    ? { slug, disponivel: false, motivo: 'Já existe um artigo com esta URL.', sugestao }
    : { slug, disponivel: true, motivo: null, sugestao: null }
}
