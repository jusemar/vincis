'use server'

import { z } from 'zod'
import { obterAutorDaSessao, obterModeradorDaSessao } from '../lib/autorizacao'
import { conferirSlugArtigo, type SituacaoSlug } from '../queries/slug'

const entradaSchema = z.object({
  slug: z.string().max(200),
  artigoId: z.string().uuid().nullable().optional(),
})

/**
 * Conferência ao vivo da URL amigável no formulário. Só para quem pode escrever
 * artigos (autor da sessão ou Gestão). Responde apenas "livre/ocupado" e uma
 * sugestão — nada sobre o artigo que ocupa a URL.
 */
export async function verificarSlugArtigo(entrada: unknown): Promise<SituacaoSlug | null> {
  const [autor, gestor] = await Promise.all([obterAutorDaSessao(), obterModeradorDaSessao()])
  if (!autor && !gestor) return null
  const validacao = entradaSchema.safeParse(entrada)
  if (!validacao.success) return null
  return conferirSlugArtigo(validacao.data.slug, validacao.data.artigoId ?? null)
}
