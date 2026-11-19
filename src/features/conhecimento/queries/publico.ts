import { and, asc, count, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { cache } from 'react'
import { db } from '@/db/connection'
import {
  conhecimentoArtigoVersoes,
  conhecimentoArtigos,
  conhecimentoCategorias,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { nomesDosEscritoriosPublicos } from '@/features/empresas/queries/escritorio-publico'
import { garantirSlugsDosPrestadores } from '@/features/perfis/lib/slug-perfil'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { condicaoIdentidadeEquipeVincis } from '@/features/usuarios/lib/identidade-publica'
import { montarAutorPublico } from '../lib/montar-autor'
import {
  LIMITE_ARTIGOS_SITEMAP,
  LIMITE_DESTAQUES,
  LIMITE_RELACIONADOS,
  POR_PAGINA_CONHECIMENTO,
} from '../constants/limites'
import { lerConteudoArtigo, minutosDeLeitura } from '../lib/conteudo/schema-conteudo'
import { PADRAO_SLUG_ARTIGO } from '../lib/slug-artigo'
import type { ArtigoCompleto, CardArtigo, CategoriaPublica } from '../types/artigo'

/**
 * Leituras **públicas** da Central de Conhecimento.
 *
 * Fonte única para a Central (`/conhecimento`), a página do artigo, a seção
 * "Artigos deste profissional" e o sitemap. Regras fixas em todas:
 * - só `status_publicacao = 'publicado'`, e sempre a **versão publicada**
 *   (`versao_publicada_id`) — rascunho, revisão em análise, devolvido e
 *   rejeitado nunca são selecionados aqui;
 * - artigo de profissional só com o autor ainda ativo, verificado e prestador
 *   público — perfil desativado leva os artigos junto para fora do ar;
 * - nenhum dado privado do autor (e-mail, telefone, documento) é selecionado.
 */

const responsavel = alias(usuarios, 'responsavel_editorial')

export function condicaoPublicado(): SQL {
  return and(
    eq(conhecimentoArtigos.statusPublicacao, 'publicado'),
    or(
      eq(conhecimentoArtigos.tipoAutoria, 'institucional'),
      and(
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        // Profissional público, ou integrante da equipe Vincis assinando como tal.
        or(condicaoPrestadorPublico(), condicaoIdentidadeEquipeVincis()),
      ),
    ),
  ) as SQL
}

const camposCard = {
  id: conhecimentoArtigos.id,
  slug: conhecimentoArtigos.slug,
  destaque: conhecimentoArtigos.destaque,
  tipoAutoria: conhecimentoArtigos.tipoAutoria,
  publicadoEm: conhecimentoArtigos.publicadoEm,
  atualizadoPublicoEm: conhecimentoArtigos.atualizadoPublicoEm,
  titulo: conhecimentoArtigoVersoes.titulo,
  resumo: conhecimentoArtigoVersoes.resumo,
  capaUrl: conhecimentoArtigoVersoes.capaUrl,
  capaAlt: conhecimentoArtigoVersoes.capaAlt,
  categoriaNome: conhecimentoCategorias.nome,
  categoriaSlug: conhecimentoCategorias.slug,
  autorId: usuarios.id,
  autorNome: usuarios.nome,
  autorIdentidade: usuarios.identidadePublica,
  autorAvatar: perfisProfissionais.avatarUrl,
  autorFotoDestaque: perfisProfissionais.fotoDestaqueUrl,
  autorTipoProfissional: perfisProfissionais.tipoProfissional,
  autorModalidade: perfisProfissionais.modalidadeAtuacao,
  autorEspecialidades: perfisProfissionais.especialidades,
  autorAreas: perfisProfissionais.areasAtuacao,
  autorCidade: perfisProfissionais.cidade,
  autorEstado: perfisProfissionais.estado,
  autorSlug: perfisProfissionais.slugPublico,
  responsavelNome: responsavel.nome,
}

function consultaBase() {
  return db
    .select(camposCard)
    .from(conhecimentoArtigos)
    .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
    .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
    .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
    .leftJoin(conhecimentoCategorias, eq(conhecimentoCategorias.id, conhecimentoArtigoVersoes.categoriaId))
    .leftJoin(responsavel, eq(responsavel.id, conhecimentoArtigos.responsavelEditorialId))
}

type LinhaCard = Awaited<ReturnType<typeof consultaBase>>[number]

/** Monta os cards resolvendo, numa consulta só, os escritórios dos autores. */
async function montarCards(linhas: LinhaCard[]): Promise<CardArtigo[]> {
  const escritorios = await nomesDosEscritoriosPublicos(
    linhas
      .filter(
        (linha) =>
          linha.tipoAutoria === 'profissional' &&
          linha.autorIdentidade !== 'equipe_vincis' &&
          linha.autorModalidade === 'escritorio',
      )
      .map((linha) => linha.autorId!),
  )
  return linhas.map((linha) => {
    const autor = montarAutorPublico({
      tipoAutoria: linha.tipoAutoria ?? 'profissional',
      autorId: linha.autorId!,
      autorNome: linha.autorNome ?? '',
      identidadePublica: linha.autorIdentidade ?? null,
      avatarUrl: linha.autorAvatar ?? null,
      fotoDestaqueUrl: linha.autorFotoDestaque ?? null,
      tipoProfissional: linha.autorTipoProfissional ?? null,
      especialidades: linha.autorEspecialidades ?? null,
      areasAtuacao: linha.autorAreas ?? null,
      cidade: linha.autorCidade ?? null,
      estado: linha.autorEstado ?? null,
      slugPublico: linha.autorSlug ?? null,
      responsavelNome: linha.responsavelNome ?? null,
      escritorioNome: escritorios.get(linha.autorId!) ?? null,
    })
    const publicadoEm = linha.publicadoEm ?? new Date(0)
    return {
      id: linha.id!,
      slug: linha.slug!,
      titulo: linha.titulo ?? '',
      resumo: linha.resumo ?? '',
      capaUrl: linha.capaUrl ?? null,
      capaAlt: linha.capaAlt ?? null,
      categoria: linha.categoriaNome && linha.categoriaSlug ? { nome: linha.categoriaNome, slug: linha.categoriaSlug } : null,
      autor,
      publicadoEm,
      atualizadoEm: linha.atualizadoPublicoEm ?? publicadoEm,
      destaque: Boolean(linha.destaque),
    }
  })
}

/** Escapa curingas do LIKE: o termo do visitante é texto, nunca padrão. */
function termoDeBusca(busca: string) {
  return `%${busca.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`
}

export const listarCategoriasAtivas = cache(async (): Promise<CategoriaPublica[]> => {
  const linhas = await db
    .select({
      id: conhecimentoCategorias.id,
      nome: conhecimentoCategorias.nome,
      slug: conhecimentoCategorias.slug,
      descricao: conhecimentoCategorias.descricao,
      areaBusca: conhecimentoCategorias.areaBusca,
      chamadaConversao: conhecimentoCategorias.chamadaConversao,
    })
    .from(conhecimentoCategorias)
    .where(eq(conhecimentoCategorias.ativa, true))
    .orderBy(asc(conhecimentoCategorias.ordem), asc(conhecimentoCategorias.nome))
  return linhas.map((linha) => ({ ...linha, areaBusca: linha.areaBusca as CategoriaPublica['areaBusca'] }))
})

export async function listarArtigosPublicados(filtros: {
  busca?: string
  categoriaSlug?: string
  pagina: number
  porPagina?: number
}): Promise<{ itens: CardArtigo[]; total: number; pagina: number; totalPaginas: number }> {
  const porPagina = filtros.porPagina ?? POR_PAGINA_CONHECIMENTO
  const condicoes: SQL[] = [condicaoPublicado()]
  if (filtros.categoriaSlug) condicoes.push(eq(conhecimentoCategorias.slug, filtros.categoriaSlug))
  if (filtros.busca) {
    const termo = termoDeBusca(filtros.busca)
    condicoes.push(
      or(
        ilike(conhecimentoArtigoVersoes.titulo, termo),
        ilike(conhecimentoArtigoVersoes.resumo, termo),
        ilike(conhecimentoCategorias.nome, termo),
        // Palavras-chave do autor entram na busca interna.
        sql`array_to_string(${conhecimentoArtigoVersoes.palavrasChave}, ' ') ilike ${termo}`,
      ) as SQL,
    )
  }
  const where = and(...condicoes)
  const [linhas, [{ total }]] = await Promise.all([
    consultaBase()
      .where(where)
      .orderBy(desc(conhecimentoArtigos.publicadoEm), desc(conhecimentoArtigos.id))
      .limit(porPagina)
      .offset((filtros.pagina - 1) * porPagina),
    db
      .select({ total: count() })
      .from(conhecimentoArtigos)
      .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
      .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
      .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
      .leftJoin(conhecimentoCategorias, eq(conhecimentoCategorias.id, conhecimentoArtigoVersoes.categoriaId))
      .where(where),
  ])
  return {
    itens: await montarCards(linhas),
    total,
    pagina: filtros.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  }
}

/** Destaques escolhidos pela Gestão. Sem destaque marcado, lista vazia — nada é inventado. */
export async function listarArtigosEmDestaque(): Promise<CardArtigo[]> {
  const linhas = await consultaBase()
    .where(and(condicaoPublicado(), eq(conhecimentoArtigos.destaque, true)))
    .orderBy(desc(conhecimentoArtigos.atualizadoPublicoEm))
    .limit(LIMITE_DESTAQUES)
  return montarCards(linhas)
}

/** Artigo publicado pelo slug, com corpo revalidado. Memorizado por requisição. */
export const obterArtigoPublicado = cache(async (slugBruto: string): Promise<ArtigoCompleto | null> => {
  let slug: string
  try {
    slug = decodeURIComponent(slugBruto).toLowerCase()
  } catch {
    return null
  }
  if (!PADRAO_SLUG_ARTIGO.test(slug) || slug.length > 160) return null

  const [linha] = await db
    .select({
      ...camposCard,
      conteudo: conhecimentoArtigoVersoes.conteudo,
      fontes: conhecimentoArtigoVersoes.fontes,
      palavrasChave: conhecimentoArtigoVersoes.palavrasChave,
      tituloSeo: conhecimentoArtigoVersoes.tituloSeo,
      descricaoSeo: conhecimentoArtigoVersoes.descricaoSeo,
      categoriaId: conhecimentoCategorias.id,
      categoriaDescricao: conhecimentoCategorias.descricao,
      categoriaArea: conhecimentoCategorias.areaBusca,
      categoriaChamada: conhecimentoCategorias.chamadaConversao,
    })
    .from(conhecimentoArtigos)
    .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
    .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
    .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
    .leftJoin(conhecimentoCategorias, eq(conhecimentoCategorias.id, conhecimentoArtigoVersoes.categoriaId))
    .leftJoin(responsavel, eq(responsavel.id, conhecimentoArtigos.responsavelEditorialId))
    .where(and(eq(conhecimentoArtigos.slug, slug), condicaoPublicado()))
    .limit(1)
  if (!linha) return null

  const conteudo = lerConteudoArtigo(linha.conteudo)
  if (!conteudo) {
    // Conteúdo fora do schema nunca é desenhado — melhor 404 que HTML inesperado.
    console.error('[CONHECIMENTO_CONTEUDO_INVALIDO]', { artigoId: linha.id })
    return null
  }

  // O link "Ver perfil" usa o endereço amigável; o slug do autor nasce aqui se faltar.
  if (linha.tipoAutoria === 'profissional' && linha.autorIdentidade !== 'equipe_vincis' && !linha.autorSlug && linha.autorId) {
    linha.autorSlug = (await garantirSlugsDosPrestadores([linha.autorId])).get(linha.autorId) ?? null
  }
  const [card] = await montarCards([linha])
  return {
    ...card,
    conteudo,
    fontes: linha.fontes ?? [],
    palavrasChave: linha.palavrasChave ?? [],
    tituloSeo: linha.tituloSeo,
    descricaoSeo: linha.descricaoSeo,
    categoriaCompleta: linha.categoriaId
      ? {
          id: linha.categoriaId,
          nome: linha.categoriaNome ?? '',
          slug: linha.categoriaSlug ?? '',
          descricao: linha.categoriaDescricao ?? null,
          areaBusca: (linha.categoriaArea as CategoriaPublica['areaBusca']) ?? null,
          chamadaConversao: linha.categoriaChamada ?? null,
        }
      : null,
    minutosLeitura: minutosDeLeitura(conteudo),
  }
})

/** Mesma categoria primeiro; completa com os mais recentes. Nunca o próprio artigo. */
export async function listarArtigosRelacionados(artigo: { id: string; categoriaId: string | null }): Promise<CardArtigo[]> {
  const mesmaCategoria = artigo.categoriaId
    ? await consultaBase()
        .where(
          and(
            condicaoPublicado(),
            ne(conhecimentoArtigos.id, artigo.id),
            eq(conhecimentoArtigoVersoes.categoriaId, artigo.categoriaId),
          ),
        )
        .orderBy(desc(conhecimentoArtigos.publicadoEm))
        .limit(LIMITE_RELACIONADOS)
    : []
  const faltam = LIMITE_RELACIONADOS - mesmaCategoria.length
  const outros =
    faltam > 0
      ? await consultaBase()
          .where(
            and(
              condicaoPublicado(),
              ne(conhecimentoArtigos.id, artigo.id),
              mesmaCategoria.length
                ? sql`${conhecimentoArtigos.id} not in (${sql.join(
                    mesmaCategoria.map((linha) => sql`${linha.id}`),
                    sql`, `,
                  )})`
                : undefined,
            ),
          )
          .orderBy(desc(conhecimentoArtigos.publicadoEm))
          .limit(faltam)
      : []
  return montarCards([...mesmaCategoria, ...outros])
}

/** "Artigos deste profissional": só os publicados **deste** autor profissional. */
export async function listarArtigosPublicadosDoAutor(autorId: string, limite: number): Promise<CardArtigo[]> {
  const linhas = await consultaBase()
    .where(
      and(
        condicaoPublicado(),
        eq(conhecimentoArtigos.autorId, autorId),
        eq(conhecimentoArtigos.tipoAutoria, 'profissional'),
      ),
    )
    .orderBy(desc(conhecimentoArtigos.publicadoEm))
    .limit(limite)
  return montarCards(linhas)
}

/** Sitemap: só slug e data real da última versão que foi ao ar. */
export async function listarArtigosParaSitemap(): Promise<{ slug: string; atualizadoEm: Date }[]> {
  const linhas = await db
    .select({
      slug: conhecimentoArtigos.slug,
      atualizadoEm: conhecimentoArtigos.atualizadoPublicoEm,
      publicadoEm: conhecimentoArtigos.publicadoEm,
    })
    .from(conhecimentoArtigos)
    .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
    .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
    .where(condicaoPublicado())
    .orderBy(desc(conhecimentoArtigos.publicadoEm))
    .limit(LIMITE_ARTIGOS_SITEMAP)
  return linhas.map((linha) => ({ slug: linha.slug, atualizadoEm: linha.atualizadoEm ?? linha.publicadoEm ?? new Date(0) }))
}
