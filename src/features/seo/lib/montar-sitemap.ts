import type { MetadataRoute } from 'next'
import { listarPaginasPublicadasParaSitemap } from '@/features/cms/queries/publico'
import {
  listarIndexaveisSemSlug,
  listarPerfisIndexaveis,
} from '@/features/profissionais/queries/perfis-indexaveis'
import { garantirSlugsDosPrestadores } from '@/features/perfis/lib/slug-perfil'
import { listarArtigosParaSitemap } from '@/features/conhecimento/queries/publico'
import { caminhoArtigo } from '@/features/conhecimento/constants/rotas'
import {
  ROTAS_INSTITUCIONAIS_INDEXAVEIS,
  URL_CANONICA_SITE,
  caminhoPerfilPublico,
} from '../constants/indexacao'

const LIMITE_SLUGS_POR_SITEMAP = 200

function urlAbsoluta(caminho: string): string {
  return new URL(caminho, URL_CANONICA_SITE).toString()
}

/**
 * Lê uma fonte dinâmica sem derrubar o sitemap inteiro.
 *
 * Banco fora do ar não pode virar 500 em `/sitemap.xml`: as páginas
 * institucionais continuam sendo servidas e a falha fica no log do servidor,
 * com um prefixo fácil de procurar.
 */
async function lerFonte<T>(nome: string, leitura: () => Promise<T[]>): Promise<T[]> {
  try {
    return await leitura()
  } catch (erro) {
    console.error('[SITEMAP_FONTE_FALHOU]', { fonte: nome, erro })
    return []
  }
}

/**
 * Sitemap da Vincis: institucionais + CMS publicado + perfis públicos reais
 * (endereço amigável) + artigos publicados da Central de Conhecimento.
 *
 * `lastModified` só aparece quando existe uma data real gravada no banco; as
 * rotas institucionais vêm do código e ficam sem data em vez de receber uma
 * inventada. `changeFrequency` e `priority` são ignorados pelo Google e não
 * entram.
 */
export async function montarSitemap(): Promise<MetadataRoute.Sitemap> {
  // Perfis indexáveis anteriores ao slug ganham o endereço amigável antes de
  // entrar no sitemap (uma vez só; depois o slug já existe). Limitado por
  // chamada para o sitemap nunca virar uma migração em massa.
  await lerFonte('slugs', async () => {
    await garantirSlugsDosPrestadores(await listarIndexaveisSemSlug(LIMITE_SLUGS_POR_SITEMAP))
    return []
  })

  const [paginasCms, perfis, artigos] = await Promise.all([
    lerFonte('cms', listarPaginasPublicadasParaSitemap),
    lerFonte('perfis', listarPerfisIndexaveis),
    lerFonte('conhecimento', listarArtigosParaSitemap),
  ])

  return [
    ...ROTAS_INSTITUCIONAIS_INDEXAVEIS.map((caminho) => ({ url: urlAbsoluta(caminho) })),
    ...paginasCms.map(({ slug, atualizadaEm }) => ({
      url: urlAbsoluta(`/${slug}`),
      lastModified: atualizadaEm,
    })),
    ...perfis.map(({ prestadorId, slugPublico, atualizadoEm }) => ({
      url: urlAbsoluta(caminhoPerfilPublico(prestadorId, slugPublico)),
      lastModified: atualizadoEm,
    })),
    // Só artigos publicados; data = última versão aprovada que foi ao ar.
    ...artigos.map(({ slug, atualizadoEm }) => ({
      url: urlAbsoluta(caminhoArtigo(slug)),
      lastModified: atualizadoEm,
    })),
  ]
}
