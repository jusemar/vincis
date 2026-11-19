import { revalidatePath, updateTag } from 'next/cache'
import { ROTA_CONHECIMENTO, ROTA_GESTAO_CONHECIMENTO, ROTA_MEUS_ARTIGOS, caminhoArtigo } from '../constants/rotas'

/**
 * Depois de qualquer decisão que muda o que o público vê: Central, página do
 * artigo, perfis (seção "Artigos deste profissional") e sitemap. As páginas
 * públicas também são dinâmicas — isto só garante que nenhum cache de rota
 * segure um artigo despublicado.
 */
export function revalidarConhecimento(slug?: string | null) {
  revalidatePath(ROTA_CONHECIMENTO)
  if (slug) revalidatePath(caminhoArtigo(slug))
  revalidatePath('/profissionais/[slug]', 'page')
  revalidatePath('/sitemap.xml')
  revalidatePath(ROTA_MEUS_ARTIGOS, 'layout')
  revalidatePath(ROTA_GESTAO_CONHECIMENTO, 'layout')
  // Cards da Home que exibem artigos: publicar, revisar, despublicar ou
  // arquivar muda (ou restaura) o card na hora.
  updateTag(TAG_CONHECIMENTO_HOME)
  revalidatePath('/')
}

/** Etiqueta do cache dos artigos exibidos nos cards da Home. */
export const TAG_CONHECIMENTO_HOME = 'conhecimento-home'
