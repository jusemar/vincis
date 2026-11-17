import { revalidatePath, updateTag } from 'next/cache'
import {
  TAG_CMS_CARDS_HOME,
  TAG_CMS_NAVEGACAO,
  TAG_CMS_PAGINAS_PUBLICADAS,
  tagCmsPagina,
} from '../nucleo/lib/cache'
import { ROTA_GESTAO_CMS } from './rotas'

/**
 * Invalidação depois de uma mutação: só o que mudou, nunca o site inteiro.
 *
 * - `slugs`: as páginas públicas afetadas (inclui o slug antigo numa troca);
 * - `publicadas`: o conjunto de slugs no ar mudou (publicar, despublicar,
 *   arquivar, trocar o slug de uma página publicada);
 * - `navegacao`: o rodapé pode ter mudado;
 * - `cardsHome`: os cards de serviço da página inicial mudaram.
 *
 * `updateTag` (e não `revalidateTag`) porque a chamada vem de uma Server
 * Action e o Gestor precisa ver o próprio salvamento na volta, e não a versão
 * antiga servida enquanto o cache se refaz.
 */
export function revalidarCms({
  slugs = [],
  publicadas = false,
  navegacao = false,
  cardsHome = false,
}: {
  slugs?: readonly string[]
  publicadas?: boolean
  navegacao?: boolean
  cardsHome?: boolean
}) {
  for (const slug of new Set(slugs)) updateTag(tagCmsPagina(slug))
  if (publicadas) updateTag(TAG_CMS_PAGINAS_PUBLICADAS)
  if (navegacao) updateTag(TAG_CMS_NAVEGACAO)
  if (cardsHome) updateTag(TAG_CMS_CARDS_HOME)
  revalidatePath(ROTA_GESTAO_CMS)
}
