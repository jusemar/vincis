import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/db/connection'
import {
  cmsCardsHome,
  conhecimentoArtigoVersoes,
  conhecimentoArtigos,
  conhecimentoCategorias,
  conhecimentoDestaquesHome,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import type { CardHomePublicoDTO } from '@/features/cms/types'
import { caminhoArtigo } from '../constants/rotas'
import { TAG_CONHECIMENTO_HOME } from '../lib/revalidacao'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { condicaoPublicado } from './publico'

/**
 * Artigos da Central exibidos nos cards da Home.
 *
 * O card original (CMS) nunca é alterado: aqui só se decide, na leitura, se um
 * card mostra um artigo. A condição de "publicado" é **a mesma** da Central —
 * rascunho, revisão, rejeitado, despublicado, arquivado ou autor desativado não
 * passam, e o card volta sozinho ao conteúdo original.
 */

const UMA_HORA = 3_600
const LIMITE_TITULO_CARD = 90
const LIMITE_RESUMO_CARD = 150

function encurtar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, '')}…`
}

type ArtigoDoCard = {
  cardId: string
  slug: string
  titulo: string
  resumo: string
  categoria: string | null
  capaUrl: string | null
  capaAlt: string | null
}

const lerArtigosDosCards = unstable_cache(
  async (): Promise<ArtigoDoCard[]> =>
    db
      .select({
        cardId: conhecimentoDestaquesHome.cardId,
        slug: conhecimentoArtigos.slug,
        titulo: conhecimentoArtigoVersoes.titulo,
        resumo: conhecimentoArtigoVersoes.resumo,
        categoria: conhecimentoCategorias.nome,
        // Capa da versão publicada — a mesma da Central (troca de capa aprovada
        // aparece aqui sozinha; sem capa, o card fica só com texto).
        capaUrl: conhecimentoArtigoVersoes.capaUrl,
        capaAlt: conhecimentoArtigoVersoes.capaAlt,
      })
      .from(conhecimentoDestaquesHome)
      .innerJoin(conhecimentoArtigos, eq(conhecimentoArtigos.id, conhecimentoDestaquesHome.artigoId))
      .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
      .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
      .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
      .leftJoin(conhecimentoCategorias, eq(conhecimentoCategorias.id, conhecimentoArtigoVersoes.categoriaId))
      .where(condicaoPublicado()),
  // v2: passou a incluir a capa — chave nova para não servir entrada antiga sem ela.
  ['conhecimento-artigos-cards-home-v2'],
  { tags: [TAG_CONHECIMENTO_HOME], revalidate: UMA_HORA },
)

/**
 * Cards da Home com os artigos escolhidos pela Gestão aplicados. Mesmo estilo
 * (cor, posição) do card; muda só o conteúdo: categoria no selo, título,
 * resumo, "Ler artigo" e a página real do artigo. Nunca lança: na falha, os
 * cards originais seguem como estão. Com capa, leva também a imagem.
 */
export async function aplicarArtigosAosCards(cards: CardHomePublicoDTO[]): Promise<CardHomePublicoDTO[]> {
  if (!cards.length) return cards
  try {
    const artigos = new Map((await lerArtigosDosCards()).map((artigo) => [artigo.cardId, artigo]))
    return cards.map((card) => {
      const artigo = artigos.get(card.id)
      if (!artigo) return card
      return {
        ...card,
        selo: artigo.categoria ?? 'Central de Conhecimento',
        titulo: encurtar(artigo.titulo, LIMITE_TITULO_CARD),
        descricao: encurtar(artigo.resumo, LIMITE_RESUMO_CARD),
        textoBotao: 'Ler artigo',
        href: caminhoArtigo(artigo.slug),
        imagem: artigo.capaUrl ? { url: artigo.capaUrl, alt: artigo.capaAlt ?? '' } : null,
      }
    })
  } catch (erro) {
    console.error('[CONHECIMENTO_CARDS_HOME_FALHOU]', { tipo: erro instanceof Error ? erro.name : 'desconhecido' })
    return cards
  }
}

export type CardParaDestaque = {
  cardId: string
  ordem: number
  tituloOriginal: string
  seloOriginal: string | null
  ativo: boolean
  artigoId: string | null
  artigoTitulo: string | null
  /** O artigo escolhido está publicado agora? Se não, o card mostra o original. */
  artigoNoAr: boolean
}

/** Gestão: cards da Home (não excluídos) e o artigo ligado a cada um. */
export async function listarCardsParaDestaque(): Promise<CardParaDestaque[]> {
  const cards = await db
    .select({
      cardId: cmsCardsHome.id,
      ordem: cmsCardsHome.ordem,
      tituloOriginal: cmsCardsHome.titulo,
      seloOriginal: cmsCardsHome.selo,
      ativo: cmsCardsHome.ativo,
      artigoId: conhecimentoDestaquesHome.artigoId,
    })
    .from(cmsCardsHome)
    .leftJoin(conhecimentoDestaquesHome, eq(conhecimentoDestaquesHome.cardId, cmsCardsHome.id))
    .where(isNull(cmsCardsHome.excluidoEm))
    .orderBy(asc(cmsCardsHome.ordem), asc(cmsCardsHome.createdAt))

  const ids = cards.map((card) => card.artigoId).filter((id): id is string => Boolean(id))
  const titulos = ids.length
    ? await db
        .select({ id: conhecimentoArtigos.id, titulo: conhecimentoArtigoVersoes.titulo, status: conhecimentoArtigos.statusPublicacao })
        .from(conhecimentoArtigos)
        .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
        .where(inArray(conhecimentoArtigos.id, ids))
    : []
  const noAr = ids.length
    ? new Set(
        (
          await db
            .select({ id: conhecimentoArtigos.id })
            .from(conhecimentoArtigos)
            .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
            .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
            .where(and(inArray(conhecimentoArtigos.id, ids), condicaoPublicado()))
        ).map(({ id }) => id),
      )
    : new Set<string>()
  const mapaTitulos = new Map(titulos.map((linha) => [linha.id, linha.titulo]))
  return cards.map((card) => ({
    ...card,
    artigoTitulo: card.artigoId ? (mapaTitulos.get(card.artigoId) ?? null) : null,
    artigoNoAr: Boolean(card.artigoId && noAr.has(card.artigoId)),
  }))
}

/** Gestão: artigos publicados que podem ir para um card (mais recentes primeiro). */
export async function listarArtigosPublicadosParaCards(): Promise<{ id: string; titulo: string; categoria: string | null }[]> {
  return db
    .select({ id: conhecimentoArtigos.id, titulo: conhecimentoArtigoVersoes.titulo, categoria: conhecimentoCategorias.nome })
    .from(conhecimentoArtigos)
    .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
    .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
    .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
    .leftJoin(conhecimentoCategorias, eq(conhecimentoCategorias.id, conhecimentoArtigoVersoes.categoriaId))
    .where(and(condicaoPublicado(), isNotNull(conhecimentoArtigos.versaoPublicadaId)))
    .orderBy(desc(conhecimentoArtigos.publicadoEm))
    .limit(200)
}

export type PainelCardsHomeDoArtigo = {
  /** `null` = artigo ainda não salvo. */
  artigoId: string | null
  /** Publicado agora (mesma regra da Central)? Só assim pode ocupar um card. */
  artigoPublicado: boolean
  cards: CardParaDestaque[]
}

/**
 * Editor do artigo: os três cards da Home, quem ocupa cada um e se este artigo
 * pode entrar. Mesma fonte da aba "Cards da Home" (tabela
 * `conhecimento_destaques_home`), então as duas telas ficam sincronizadas.
 *
 * Só o Gestor recebe o painel (`null` para qualquer outra sessão) — a action
 * confere de novo antes de gravar.
 */
export async function obterPainelCardsHomeDoArtigo(artigoId: string | null): Promise<PainelCardsHomeDoArtigo | null> {
  const gestor = await validarGestorVincis()
  if (!gestor) return null
  const [cards, publicado] = await Promise.all([
    listarCardsParaDestaque(),
    artigoId
      ? db
          .select({ id: conhecimentoArtigos.id })
          .from(conhecimentoArtigos)
          .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
          .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
          .where(and(eq(conhecimentoArtigos.id, artigoId), condicaoPublicado()))
          .limit(1)
      : Promise.resolve([]),
  ])
  return { artigoId, artigoPublicado: publicado.length > 0, cards }
}
