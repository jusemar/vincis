import { and, asc, eq, isNull } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/db/connection'
import { cmsCardsHome, cmsPaginas } from '@/db/schema'
import { exigirAdministradorCms } from '../integracao/autorizacao'
import {
  LIMITES_CARD_HOME,
  type EstiloCardHome,
  type TipoDestinoCardHome,
} from '../integracao/cards-home/constantes'
import { resolverDestinoCardHome } from '../integracao/cards-home/destino'
import { TAG_CMS_CARDS_HOME, TAG_CMS_PAGINAS_PUBLICADAS } from '../nucleo/lib/cache'
import type { StatusPagina } from '../nucleo/types'
import type { CardHomeGestaoDTO, CardHomePublicoDTO } from '../types'

/**
 * Leituras dos Cards da Home.
 *
 * Ordem determinística em todas: `ordem`, depois criação, depois id — dois
 * cards com a mesma posição nunca trocam de lugar entre uma leitura e outra.
 * Excluídos (lógicos) não existem para nenhuma das duas.
 */

/** Mesmo teto que a criação respeita: a Gestão sempre vê todos os cards. */
const LIMITE_CARDS = LIMITES_CARD_HOME.quantidade
const UMA_HORA = 3_600

const COLUNAS = {
  id: cmsCardsHome.id,
  selo: cmsCardsHome.selo,
  titulo: cmsCardsHome.titulo,
  descricao: cmsCardsHome.descricao,
  textoBotao: cmsCardsHome.textoBotao,
  estilo: cmsCardsHome.estilo,
  destinoTipo: cmsCardsHome.destinoTipo,
  paginaId: cmsCardsHome.paginaId,
  rota: cmsCardsHome.rota,
  ativo: cmsCardsHome.ativo,
  ordem: cmsCardsHome.ordem,
  updatedAt: cmsCardsHome.updatedAt,
  paginaTitulo: cmsPaginas.titulo,
  paginaSlug: cmsPaginas.slug,
  paginaStatus: cmsPaginas.status,
}

const ORDEM = [asc(cmsCardsHome.ordem), asc(cmsCardsHome.createdAt), asc(cmsCardsHome.id)]

/** Todos os cards não excluídos, para a Gestão. `null` para quem não é Gestor. */
export async function listarCardsHomeGestao(): Promise<CardHomeGestaoDTO[] | null> {
  if (!(await exigirAdministradorCms())) return null

  const linhas = await db
    .select(COLUNAS)
    .from(cmsCardsHome)
    .leftJoin(cmsPaginas, eq(cmsPaginas.id, cmsCardsHome.paginaId))
    .where(isNull(cmsCardsHome.excluidoEm))
    .orderBy(...ORDEM)
    .limit(LIMITE_CARDS)

  return linhas.map((linha) => {
    const destinoTipo = linha.destinoTipo as TipoDestinoCardHome
    const paginaStatus = (linha.paginaStatus as StatusPagina | null) ?? null
    return {
      ...linha,
      estilo: linha.estilo as EstiloCardHome,
      destinoTipo,
      paginaStatus,
      href: resolverDestinoCardHome({
        destinoTipo,
        rota: linha.rota,
        paginaSlug: linha.paginaSlug,
        paginaStatus,
      }),
      updatedAt: linha.updatedAt.toISOString(),
    }
  })
}

/**
 * Cards no ar. Também etiquetado com as páginas publicadas: publicar, despublicar
 * ou arquivar uma página de destino atualiza a Home sem ninguém lembrar disso.
 */
const lerCardsPublicos = unstable_cache(
  async (): Promise<CardHomePublicoDTO[]> => {
    const linhas = await db
      .select(COLUNAS)
      .from(cmsCardsHome)
      .leftJoin(cmsPaginas, eq(cmsPaginas.id, cmsCardsHome.paginaId))
      .where(and(isNull(cmsCardsHome.excluidoEm), eq(cmsCardsHome.ativo, true)))
      .orderBy(...ORDEM)
      .limit(LIMITE_CARDS)

    return linhas.flatMap((linha) => {
      const href = resolverDestinoCardHome({
        destinoTipo: linha.destinoTipo as TipoDestinoCardHome,
        rota: linha.rota,
        paginaSlug: linha.paginaSlug,
        paginaStatus: (linha.paginaStatus as StatusPagina | null) ?? null,
      })
      // Card sem destino no ar sai do site: nunca um link quebrado.
      if (!href) return []
      return [
        {
          id: linha.id,
          selo: linha.selo,
          titulo: linha.titulo,
          descricao: linha.descricao,
          textoBotao: linha.textoBotao,
          estilo: linha.estilo as EstiloCardHome,
          href,
        },
      ]
    })
  },
  ['cms-cards-home'],
  { tags: [TAG_CMS_CARDS_HOME, TAG_CMS_PAGINAS_PUBLICADAS], revalidate: UMA_HORA },
)

/**
 * Cards da Home para o visitante.
 *
 * Nunca lança: uma falha do banco não pode derrubar a página inicial. Na falha,
 * a seção some (lista vazia) e o erro fica no log; a falha não é guardada em
 * cache, então a próxima leitura tenta de novo.
 */
export async function listarCardsHomePublicos(): Promise<CardHomePublicoDTO[]> {
  try {
    return await lerCardsPublicos()
  } catch (erro) {
    console.error('[CMS_CARDS_HOME_INDISPONIVEIS] Cards da Home não carregaram.', {
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    return []
  }
}
