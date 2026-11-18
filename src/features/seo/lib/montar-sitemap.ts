import type { MetadataRoute } from 'next'
import { listarPaginasPublicadasParaSitemap } from '@/features/cms/queries/publico'
import { listarPerfisIndexaveis } from '@/features/profissionais/queries/perfis-indexaveis'
import {
  ROTAS_INSTITUCIONAIS_INDEXAVEIS,
  URL_CANONICA_SITE,
  caminhoPerfilPublico,
} from '../constants/indexacao'

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
 * Sitemap da Vincis: institucionais + CMS publicado + perfis públicos reais.
 *
 * `lastModified` só aparece quando existe uma data real gravada no banco; as
 * rotas institucionais vêm do código e ficam sem data em vez de receber uma
 * inventada. `changeFrequency` e `priority` são ignorados pelo Google e não
 * entram.
 */
export async function montarSitemap(): Promise<MetadataRoute.Sitemap> {
  const [paginasCms, perfis] = await Promise.all([
    lerFonte('cms', listarPaginasPublicadasParaSitemap),
    lerFonte('perfis', listarPerfisIndexaveis),
  ])

  return [
    ...ROTAS_INSTITUCIONAIS_INDEXAVEIS.map((caminho) => ({ url: urlAbsoluta(caminho) })),
    ...paginasCms.map(({ slug, atualizadaEm }) => ({
      url: urlAbsoluta(`/${slug}`),
      lastModified: atualizadaEm,
    })),
    ...perfis.map(({ prestadorId, atualizadoEm }) => ({
      url: urlAbsoluta(caminhoPerfilPublico(prestadorId)),
      lastModified: atualizadoEm,
    })),
  ]
}
