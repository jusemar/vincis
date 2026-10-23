import { and, asc, count, desc, eq, ilike, inArray, ne, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cmsGruposNavegacao, cmsItensNavegacao, cmsPaginas } from '@/db/schema'
import { exigirAdministradorCms } from '../integracao/autorizacao'
import { schemasCms } from '../integracao/schemas'
import { conteudoPaginaSchema, CONTEUDO_PAGINA_VAZIO } from '../nucleo/conteudo/schema'
import type { LocalNavegacao, StatusPagina } from '../nucleo/types'
import type {
  GrupoNavegacaoGestaoDTO,
  ListagemPaginasCms,
  PaginaAssociavelDTO,
  PaginaCmsEdicaoDTO,
} from '../types'

/**
 * Leituras administrativas do CMS.
 *
 * Cada uma confere o Gestor de novo, mesmo atrás de uma página já protegida:
 * uma query exportada pode ser chamada de outro lugar amanhã. Quem não é Gestor
 * recebe `null` — nem a lista vazia, que pareceria "não há páginas".
 */

/** `%` e `_` digitados na busca são texto, não curinga. */
function escaparCuringas(texto: string) {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)
}

export async function listarPaginasCmsGestao(
  entrada: unknown = {},
): Promise<ListagemPaginasCms | null> {
  if (!(await exigirAdministradorCms())) return null

  const filtros = schemasCms.listarPaginas.parse(entrada)
  const condicoes: SQL[] = []
  if (filtros.status) condicoes.push(eq(cmsPaginas.status, filtros.status))
  if (filtros.busca) {
    const termo = `%${escaparCuringas(filtros.busca)}%`
    const busca = or(ilike(cmsPaginas.titulo, termo), ilike(cmsPaginas.slug, termo))
    if (busca) condicoes.push(busca)
  }
  const onde = condicoes.length ? and(...condicoes) : undefined

  const [linhas, [total]] = await Promise.all([
    db
      .select({
        id: cmsPaginas.id,
        titulo: cmsPaginas.titulo,
        slug: cmsPaginas.slug,
        status: cmsPaginas.status,
        tituloSeo: cmsPaginas.tituloSeo,
        descricaoSeo: cmsPaginas.descricaoSeo,
        publicadaEm: cmsPaginas.publicadaEm,
        updatedAt: cmsPaginas.updatedAt,
      })
      .from(cmsPaginas)
      .where(onde)
      .orderBy(desc(cmsPaginas.updatedAt), asc(cmsPaginas.id))
      .limit(filtros.porPagina)
      .offset((filtros.pagina - 1) * filtros.porPagina),
    db.select({ valor: count() }).from(cmsPaginas).where(onde),
  ])

  return {
    itens: linhas.map((linha) => ({
      ...linha,
      status: linha.status as StatusPagina,
      publicadaEm: linha.publicadaEm?.toISOString() ?? null,
      updatedAt: linha.updatedAt.toISOString(),
    })),
    total: total?.valor ?? 0,
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
  }
}

/**
 * Grupos de navegação com os itens, em duas consultas — uma para os grupos,
 * uma para todos os itens deles —, e não uma por grupo.
 */
export async function listarGruposNavegacaoCmsGestao(): Promise<
  GrupoNavegacaoGestaoDTO[] | null
> {
  if (!(await exigirAdministradorCms())) return null

  const grupos = await db
    .select()
    .from(cmsGruposNavegacao)
    .orderBy(asc(cmsGruposNavegacao.local), asc(cmsGruposNavegacao.ordem))
  if (!grupos.length) return []

  const itens = await db
    .select({
      id: cmsItensNavegacao.id,
      grupoId: cmsItensNavegacao.grupoId,
      paiId: cmsItensNavegacao.paiId,
      paginaId: cmsItensNavegacao.paginaId,
      paginaTitulo: cmsPaginas.titulo,
      paginaSlug: cmsPaginas.slug,
      paginaStatus: cmsPaginas.status,
      texto: cmsItensNavegacao.texto,
      ordem: cmsItensNavegacao.ordem,
      ativo: cmsItensNavegacao.ativo,
    })
    .from(cmsItensNavegacao)
    // `left`: agrupador não tem página.
    .leftJoin(cmsPaginas, eq(cmsPaginas.id, cmsItensNavegacao.paginaId))
    .where(
      inArray(
        cmsItensNavegacao.grupoId,
        grupos.map((grupo) => grupo.id),
      ),
    )
    .orderBy(asc(cmsItensNavegacao.grupoId), asc(cmsItensNavegacao.ordem))

  return grupos.map((grupo) => ({
    id: grupo.id,
    nome: grupo.nome,
    tituloPublico: grupo.tituloPublico,
    identificador: grupo.identificador,
    local: grupo.local as LocalNavegacao,
    ativo: grupo.ativo,
    ordem: grupo.ordem,
    itens: itens
      .filter((item) => item.grupoId === grupo.id)
      .map(({ grupoId: _grupoId, ...item }) => ({
        ...item,
        paginaStatus: item.paginaStatus as StatusPagina | null,
      })),
  }))
}

/** Página completa para o formulário de edição, com o conteúdo. */
export async function buscarPaginaCmsGestao(paginaId: string): Promise<PaginaCmsEdicaoDTO | null> {
  if (!(await exigirAdministradorCms())) return null
  if (!/^[0-9a-f-]{36}$/i.test(paginaId)) return null

  const [pagina] = await db.select().from(cmsPaginas).where(eq(cmsPaginas.id, paginaId)).limit(1)
  if (!pagina) return null

  // Conteúdo fora do schema atual abre vazio e avisado, em vez de quebrar o
  // editor — e o Gestor decide se salva por cima.
  const conteudo = conteudoPaginaSchema.safeParse(pagina.conteudo)
  return {
    id: pagina.id,
    titulo: pagina.titulo,
    slug: pagina.slug,
    status: pagina.status as StatusPagina,
    conteudo: conteudo.success ? conteudo.data : CONTEUDO_PAGINA_VAZIO,
    conteudoInvalido: !conteudo.success,
    tituloSeo: pagina.tituloSeo,
    descricaoSeo: pagina.descricaoSeo,
    publicadaEm: pagina.publicadaEm?.toISOString() ?? null,
    updatedAt: pagina.updatedAt.toISOString(),
  }
}

/**
 * Páginas que podem entrar num grupo de navegação: todas menos as arquivadas,
 * numa consulta só. Rascunho entra — o vínculo fica pronto e o link só aparece
 * no site quando a página for publicada.
 */
export async function listarPaginasAssociaveisCmsGestao(): Promise<PaginaAssociavelDTO[] | null> {
  if (!(await exigirAdministradorCms())) return null

  const linhas = await db
    .select({
      id: cmsPaginas.id,
      titulo: cmsPaginas.titulo,
      slug: cmsPaginas.slug,
      status: cmsPaginas.status,
    })
    .from(cmsPaginas)
    .where(ne(cmsPaginas.status, 'arquivada'))
    .orderBy(asc(cmsPaginas.titulo))
    .limit(500)
  return linhas.map((linha) => ({ ...linha, status: linha.status as StatusPagina }))
}
