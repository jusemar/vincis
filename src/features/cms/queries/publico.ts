import { and, asc, eq, isNull } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/db/connection'
import { cmsGruposNavegacao, cmsItensNavegacao, cmsPaginas } from '@/db/schema'
import { slugReservadoVincis } from '../integracao/rotas-reservadas'
import { conteudoPaginaSchema, type NoConteudo } from '../nucleo/conteudo/schema'
import {
  TAG_CMS_NAVEGACAO,
  TAG_CMS_PAGINAS_PUBLICADAS,
  tagCmsPagina,
} from '../nucleo/lib/cache'
import { PADRAO_IDENTIFICADOR, TAMANHO_MAXIMO_IDENTIFICADOR } from '../nucleo/lib/identificador'
import { montarMenuPublico, type GrupoMenuPublico } from '../nucleo/lib/arvore-navegacao'
import { montarGruposPublicos, type GrupoNavegacaoPublico } from '../nucleo/lib/navegacao'

/**
 * Leituras públicas do CMS — sem sessão, para qualquer visitante.
 *
 * Só devolvem o que está no ar: página `publicada`; no rodapé, grupo ativo,
 * item ativo e página publicada. Rascunho e arquivada não existem aqui — nem
 * para dizer que existem.
 *
 * Ficam em cache etiquetado (`unstable_cache` com tags): as actions do CMS
 * invalidam só a etiqueta do que mudou. O `revalidate` de uma hora é rede de
 * segurança, não o mecanismo — quem atualiza é a invalidação por etiqueta.
 */

const UMA_HORA = 3_600

export type PaginaPublicaCms = {
  id: string
  titulo: string
  slug: string
  conteudo: NoConteudo
  tituloSeo: string | null
  descricaoSeo: string | null
  publicadaEm: string | null
  updatedAt: string
}

const listarSlugsPublicados = unstable_cache(
  async () => {
    const linhas = await db
      .select({ slug: cmsPaginas.slug })
      .from(cmsPaginas)
      .where(eq(cmsPaginas.status, 'publicada'))
    return linhas.map(({ slug }) => slug)
  },
  ['cms-slugs-publicados'],
  { tags: [TAG_CMS_PAGINAS_PUBLICADAS], revalidate: UMA_HORA },
)

async function lerPaginaPublicada(slug: string): Promise<PaginaPublicaCms | null> {
  const [pagina] = await db
    .select({
      id: cmsPaginas.id,
      titulo: cmsPaginas.titulo,
      slug: cmsPaginas.slug,
      conteudo: cmsPaginas.conteudo,
      tituloSeo: cmsPaginas.tituloSeo,
      descricaoSeo: cmsPaginas.descricaoSeo,
      publicadaEm: cmsPaginas.publicadaEm,
      updatedAt: cmsPaginas.updatedAt,
    })
    .from(cmsPaginas)
    .where(and(eq(cmsPaginas.slug, slug), eq(cmsPaginas.status, 'publicada')))
    .limit(1)
  if (!pagina) return null
  // O conteúdo é revalidado na leitura: um registro que não passe no schema
  // atual não chega à tela.
  const conteudo = conteudoPaginaSchema.safeParse(pagina.conteudo)
  if (!conteudo.success) {
    console.error('[CMS_PAGINA_INVALIDA] Conteúdo publicado fora do schema.', { slug })
    return null
  }
  return {
    ...pagina,
    conteudo: conteudo.data,
    publicadaEm: pagina.publicadaEm?.toISOString() ?? null,
    updatedAt: pagina.updatedAt.toISOString(),
  }
}

/** Página publicada pelo endereço, ou `null` (o chamador responde 404). */
export async function buscarPaginaPublicada(slug: string): Promise<PaginaPublicaCms | null> {
  const normalizado = slug.trim().toLowerCase()
  if (
    normalizado.length > TAMANHO_MAXIMO_IDENTIFICADOR ||
    !PADRAO_IDENTIFICADOR.test(normalizado) ||
    slugReservadoVincis(normalizado)
  )
    return null
  if (!(await listarSlugsPublicados()).includes(normalizado)) return null

  return unstable_cache(() => lerPaginaPublicada(normalizado), ['cms-pagina', normalizado], {
    tags: [tagCmsPagina(normalizado), TAG_CMS_PAGINAS_PUBLICADAS],
    revalidate: UMA_HORA,
  })()
}

const lerNavegacaoRodape = unstable_cache(
  async (): Promise<GrupoNavegacaoPublico[]> => {
    const linhas = await db
      .select({
        grupoId: cmsGruposNavegacao.id,
        grupoTitulo: cmsGruposNavegacao.tituloPublico,
        grupoOrdem: cmsGruposNavegacao.ordem,
        itemId: cmsItensNavegacao.id,
        itemOrdem: cmsItensNavegacao.ordem,
        texto: cmsItensNavegacao.texto,
        paginaTitulo: cmsPaginas.titulo,
        paginaSlug: cmsPaginas.slug,
      })
      .from(cmsGruposNavegacao)
      .innerJoin(
        cmsItensNavegacao,
        and(eq(cmsItensNavegacao.grupoId, cmsGruposNavegacao.id), eq(cmsItensNavegacao.ativo, true)),
      )
      .innerJoin(
        cmsPaginas,
        and(eq(cmsPaginas.id, cmsItensNavegacao.paginaId), eq(cmsPaginas.status, 'publicada')),
      )
      .where(
        and(
          eq(cmsGruposNavegacao.ativo, true),
          eq(cmsGruposNavegacao.local, 'rodape'),
          // O rodapé é plano: só raízes (e o `innerJoin` já deixa só links).
          isNull(cmsItensNavegacao.paiId),
        ),
      )
      .orderBy(asc(cmsGruposNavegacao.ordem), asc(cmsItensNavegacao.ordem))
    return montarGruposPublicos(linhas, slugReservadoVincis)
  },
  ['cms-navegacao-rodape'],
  { tags: [TAG_CMS_NAVEGACAO], revalidate: UMA_HORA },
)

/**
 * Colunas do rodapé vindas do CMS.
 *
 * Nunca lança: o rodapé está em todas as páginas públicas, e uma falha do
 * banco (ou do build sem banco) não pode derrubar nenhuma delas. Na falha,
 * devolve lista vazia e o Footer mostra os links fixos de sempre. O erro fica
 * no log; a falha não é guardada em cache, então a próxima leitura tenta de novo.
 */
export async function listarNavegacaoRodapePublica(): Promise<GrupoNavegacaoPublico[]> {
  try {
    return await lerNavegacaoRodape()
  } catch (erro) {
    console.error('[CMS_RODAPE_INDISPONIVEL] Rodapé do CMS não carregou; usando links fixos.', {
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    return []
  }
}

const lerMenuCabecalho = unstable_cache(
  async (): Promise<GrupoMenuPublico[]> => {
    const linhas = await db
      .select({
        grupoId: cmsGruposNavegacao.id,
        grupoTitulo: cmsGruposNavegacao.tituloPublico,
        grupoOrdem: cmsGruposNavegacao.ordem,
        itemId: cmsItensNavegacao.id,
        paiId: cmsItensNavegacao.paiId,
        itemOrdem: cmsItensNavegacao.ordem,
        texto: cmsItensNavegacao.texto,
        paginaId: cmsItensNavegacao.paginaId,
        paginaSlug: cmsPaginas.slug,
        paginaTitulo: cmsPaginas.titulo,
      })
      .from(cmsGruposNavegacao)
      .innerJoin(
        cmsItensNavegacao,
        and(eq(cmsItensNavegacao.grupoId, cmsGruposNavegacao.id), eq(cmsItensNavegacao.ativo, true)),
      )
      // `left` com a condição de publicada no próprio join: agrupador fica (sem
      // página) e link para página fora do ar chega sem slug — o núcleo o descarta.
      .leftJoin(
        cmsPaginas,
        and(eq(cmsPaginas.id, cmsItensNavegacao.paginaId), eq(cmsPaginas.status, 'publicada')),
      )
      .where(and(eq(cmsGruposNavegacao.ativo, true), eq(cmsGruposNavegacao.local, 'cabecalho')))
      .orderBy(asc(cmsGruposNavegacao.ordem), asc(cmsItensNavegacao.ordem))
    return montarMenuPublico(
      linhas.map(({ paginaId, ...linha }) => ({ ...linha, ehAgrupador: paginaId === null })),
      slugReservadoVincis,
    )
  },
  ['cms-navegacao-cabecalho'],
  { tags: [TAG_CMS_NAVEGACAO], revalidate: UMA_HORA },
)

/**
 * Itens do menu do cabeçalho vindos do CMS, já em árvore (raiz → filhos).
 *
 * Um menu só: os grupos ativos do cabeçalho entram em sequência, na ordem
 * deles. Nunca lança — na falha, o cabeçalho mostra só os links fixos.
 */
export async function listarMenuCabecalhoPublico(): Promise<GrupoMenuPublico[]> {
  try {
    return await lerMenuCabecalho()
  } catch (erro) {
    console.error('[CMS_CABECALHO_INDISPONIVEL] Menu do CMS não carregou; usando links fixos.', {
      tipo: erro instanceof Error ? erro.name : 'desconhecido',
    })
    return []
  }
}
