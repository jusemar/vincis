import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  conhecimentoArtigoVersoes,
  conhecimentoArtigos,
  conhecimentoCategorias,
  conhecimentoDecisoes,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { nomeDoEscritorioPublico } from '@/features/empresas/queries/escritorio-publico'
import { POR_PAGINA_GESTAO_CONHECIMENTO } from '../constants/limites'
import {
  STATUS_VERSAO_EM_ABERTO,
  type SituacaoEditorial,
  type StatusPublicacao,
  type StatusVersao,
} from '../constants/status'
import { CONTEUDO_ARTIGO_VAZIO, lerConteudoArtigo, minutosDeLeitura, type NoConteudo } from '../lib/conteudo/schema-conteudo'
import {
  decidirEdicao,
  podeCancelarEnvio,
  podeEnviar,
  situacaoEditorial,
  temRevisaoEmAndamento,
  type EstadoArtigo,
} from '../lib/fluxo-editorial'
import { montarAutorPublico } from '../lib/montar-autor'
import type { ArtigoCompleto, DecisaoHistorico, FonteArtigo, ResumoArtigoGestao } from '../types/artigo'

/**
 * Leituras **privadas**: painel do autor, prévia e Gestão.
 *
 * Nenhuma delas é chamada sem antes passar por uma porta de `lib/autorizacao`;
 * as do autor recebem o `autorId` da sessão e o colocam no `WHERE`. Nada daqui
 * alimenta página pública, sitemap ou cache compartilhado.
 */

type VersaoLida = {
  id: string
  artigoId: string
  numero: number
  status: StatusVersao
  titulo: string
  resumo: string
  conteudo: unknown
  categoriaId: string | null
  capaUrl: string | null
  capaAlt: string | null
  fontes: FonteArtigo[]
  palavrasChave: string[]
  tituloSeo: string | null
  descricaoSeo: string | null
  observacaoModeracao: string | null
  enviadaEm: Date | null
  decididaEm: Date | null
  updatedAt: Date
}

const camposVersao = {
  id: conhecimentoArtigoVersoes.id,
  artigoId: conhecimentoArtigoVersoes.artigoId,
  numero: conhecimentoArtigoVersoes.numero,
  status: conhecimentoArtigoVersoes.status,
  titulo: conhecimentoArtigoVersoes.titulo,
  resumo: conhecimentoArtigoVersoes.resumo,
  conteudo: conhecimentoArtigoVersoes.conteudo,
  categoriaId: conhecimentoArtigoVersoes.categoriaId,
  capaUrl: conhecimentoArtigoVersoes.capaUrl,
  capaAlt: conhecimentoArtigoVersoes.capaAlt,
  fontes: conhecimentoArtigoVersoes.fontes,
  palavrasChave: conhecimentoArtigoVersoes.palavrasChave,
  tituloSeo: conhecimentoArtigoVersoes.tituloSeo,
  descricaoSeo: conhecimentoArtigoVersoes.descricaoSeo,
  observacaoModeracao: conhecimentoArtigoVersoes.observacaoModeracao,
  enviadaEm: conhecimentoArtigoVersoes.enviadaEm,
  decididaEm: conhecimentoArtigoVersoes.decididaEm,
  updatedAt: conhecimentoArtigoVersoes.updatedAt,
}

async function versoesDosArtigos(artigoIds: string[]): Promise<Map<string, VersaoLida[]>> {
  const mapa = new Map<string, VersaoLida[]>()
  if (!artigoIds.length) return mapa
  const linhas = await db
    .select(camposVersao)
    .from(conhecimentoArtigoVersoes)
    .where(inArray(conhecimentoArtigoVersoes.artigoId, artigoIds))
    .orderBy(desc(conhecimentoArtigoVersoes.numero))
  for (const linha of linhas) {
    const lista = mapa.get(linha.artigoId) ?? []
    lista.push({ ...linha, status: linha.status as StatusVersao, fontes: linha.fontes ?? [], palavrasChave: linha.palavrasChave ?? [] })
    mapa.set(linha.artigoId, lista)
  }
  return mapa
}

function estado(statusPublicacao: string, versoes: VersaoLida[]): EstadoArtigo {
  return {
    statusPublicacao: statusPublicacao as StatusPublicacao,
    versaoAberta: versoes.find((versao) => STATUS_VERSAO_EM_ABERTO.includes(versao.status)) ?? null,
    ultimaVersao: versoes[0] ?? null,
  }
}

/** A versão "de trabalho": a aberta; senão a publicada; senão a mais recente. */
function versaoDeTrabalho(versoes: VersaoLida[], versaoPublicadaId: string | null): VersaoLida | null {
  return (
    versoes.find((versao) => STATUS_VERSAO_EM_ABERTO.includes(versao.status)) ??
    versoes.find((versao) => versao.id === versaoPublicadaId) ??
    versoes[0] ??
    null
  )
}

const camposArtigo = {
  id: conhecimentoArtigos.id,
  slug: conhecimentoArtigos.slug,
  autorId: conhecimentoArtigos.autorId,
  tipoAutoria: conhecimentoArtigos.tipoAutoria,
  statusPublicacao: conhecimentoArtigos.statusPublicacao,
  versaoPublicadaId: conhecimentoArtigos.versaoPublicadaId,
  destaque: conhecimentoArtigos.destaque,
  publicadoEm: conhecimentoArtigos.publicadoEm,
  atualizadoPublicoEm: conhecimentoArtigos.atualizadoPublicoEm,
  updatedAt: conhecimentoArtigos.updatedAt,
  responsavelEditorialId: conhecimentoArtigos.responsavelEditorialId,
  autorNome: usuarios.nome,
}

type LinhaArtigo = Awaited<ReturnType<typeof consultaArtigos>>[number]

function consultaArtigos() {
  return db.select(camposArtigo).from(conhecimentoArtigos).innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
}

async function nomesDeCategorias(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unicos.length) return new Map()
  const linhas = await db
    .select({ id: conhecimentoCategorias.id, nome: conhecimentoCategorias.nome })
    .from(conhecimentoCategorias)
    .where(inArray(conhecimentoCategorias.id, unicos))
  return new Map(linhas.map((linha) => [linha.id, linha.nome]))
}

async function resumir(linhas: LinhaArtigo[]): Promise<ResumoArtigoGestao[]> {
  const versoes = await versoesDosArtigos(linhas.map(({ id }) => id))
  const trabalho = linhas.map((linha) => versaoDeTrabalho(versoes.get(linha.id) ?? [], linha.versaoPublicadaId))
  const categorias = await nomesDeCategorias(trabalho.map((versao) => versao?.categoriaId ?? null))
  return linhas.map((linha, indice) => {
    const lista = versoes.get(linha.id) ?? []
    const situacao = estado(linha.statusPublicacao, lista)
    const versao = trabalho[indice]
    return {
      id: linha.id,
      slug: linha.slug,
      titulo: versao?.titulo ?? '(sem título)',
      situacao: situacaoEditorial(situacao),
      statusPublicacao: linha.statusPublicacao as StatusPublicacao,
      versaoAbertaStatus: situacao.versaoAberta?.status ?? null,
      revisaoEmAndamento: temRevisaoEmAndamento(situacao),
      categoria: versao?.categoriaId ? categorias.get(versao.categoriaId) ?? null : null,
      tipoAutoria: linha.tipoAutoria as 'profissional' | 'institucional',
      autorNome: linha.tipoAutoria === 'institucional' ? 'Vincis' : linha.autorNome,
      destaque: linha.destaque,
      enviadaEm: situacao.versaoAberta?.status === 'aguardando_aprovacao' ? (versao?.enviadaEm ?? null) : null,
      publicadoEm: linha.publicadoEm,
      atualizadoEm: linha.updatedAt,
    }
  })
}

/** Painel do profissional: todos os artigos **dele**, mais recentes primeiro. */
export async function listarArtigosDoAutor(autorId: string): Promise<ResumoArtigoGestao[]> {
  const linhas = await consultaArtigos()
    .where(and(eq(conhecimentoArtigos.autorId, autorId), eq(conhecimentoArtigos.tipoAutoria, 'profissional')))
    .orderBy(desc(conhecimentoArtigos.updatedAt))
    .limit(200)
  return resumir(linhas)
}

export type FiltroGestao = 'fila' | 'publicados' | 'todos' | 'arquivados'

/** Gestão: fila de moderação e demais listas, paginadas no banco. */
export async function listarArtigosGestao(filtros: {
  filtro: FiltroGestao
  busca?: string
  pagina: number
}): Promise<{ itens: ResumoArtigoGestao[]; total: number; pagina: number; totalPaginas: number }> {
  const condicoes: SQL[] = []
  if (filtros.filtro === 'fila') {
    const naFila = db
      .select({ id: conhecimentoArtigoVersoes.artigoId })
      .from(conhecimentoArtigoVersoes)
      .where(eq(conhecimentoArtigoVersoes.status, 'aguardando_aprovacao'))
    condicoes.push(inArray(conhecimentoArtigos.id, naFila))
  } else if (filtros.filtro === 'publicados') condicoes.push(eq(conhecimentoArtigos.statusPublicacao, 'publicado'))
  else if (filtros.filtro === 'arquivados') condicoes.push(eq(conhecimentoArtigos.statusPublicacao, 'arquivado'))
  if (filtros.busca) {
    const termo = `%${filtros.busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const comTitulo = db
      .select({ id: conhecimentoArtigoVersoes.artigoId })
      .from(conhecimentoArtigoVersoes)
      .where(ilike(conhecimentoArtigoVersoes.titulo, termo))
    condicoes.push(or(inArray(conhecimentoArtigos.id, comTitulo), ilike(usuarios.nome, termo)) as SQL)
  }
  const where = condicoes.length ? and(...condicoes) : undefined
  const [linhas, [{ total }]] = await Promise.all([
    consultaArtigos()
      .where(where)
      // Fila: mais antigo primeiro (ordem de chegada). Demais: atividade recente.
      .orderBy(filtros.filtro === 'fila' ? asc(conhecimentoArtigos.updatedAt) : desc(conhecimentoArtigos.updatedAt))
      .limit(POR_PAGINA_GESTAO_CONHECIMENTO)
      .offset((filtros.pagina - 1) * POR_PAGINA_GESTAO_CONHECIMENTO),
    db
      .select({ total: count() })
      .from(conhecimentoArtigos)
      .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
      .where(where),
  ])
  return {
    itens: await resumir(linhas),
    total,
    pagina: filtros.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA_GESTAO_CONHECIMENTO)),
  }
}

export async function contarFilaModeracao(): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(conhecimentoArtigoVersoes)
    .where(eq(conhecimentoArtigoVersoes.status, 'aguardando_aprovacao'))
  return total
}

async function historico(artigoId: string): Promise<DecisaoHistorico[]> {
  const linhas = await db
    .select({
      id: conhecimentoDecisoes.id,
      acao: conhecimentoDecisoes.acao,
      observacao: conhecimentoDecisoes.observacao,
      executorNome: usuarios.nome,
      criadoEm: conhecimentoDecisoes.createdAt,
    })
    .from(conhecimentoDecisoes)
    .leftJoin(usuarios, eq(usuarios.id, conhecimentoDecisoes.executorId))
    .where(eq(conhecimentoDecisoes.artigoId, artigoId))
    .orderBy(desc(conhecimentoDecisoes.createdAt))
    .limit(100)
  return linhas
}

export type ArtigoEmEdicao = {
  id: string
  slug: string
  tipoAutoria: 'profissional' | 'institucional'
  autorId: string
  autorNome: string
  assinatura: 'vincis' | 'responsavel'
  situacao: SituacaoEditorial
  statusPublicacao: StatusPublicacao
  versaoAberta: { id: string; numero: number; status: StatusVersao } | null
  revisaoEmAndamento: boolean
  /**
   * A URL já foi ao ar alguma vez? Então está fixa (canonical, sitemap e links
   * compartilhados); o campo "URL amigável" vira só leitura.
   */
  slugFixo: boolean
  /** O que o formulário carrega. */
  dados: {
    titulo: string
    slug: string | null
    palavrasChave: string[]
    resumo: string
    categoriaId: string | null
    capaUrl: string | null
    capaAlt: string | null
    conteudo: NoConteudo
    fontes: FonteArtigo[]
    tituloSeo: string | null
    descricaoSeo: string | null
  }
  /** Orientação da Vincis na versão devolvida/rejeitada mais recente. */
  observacaoModeracao: string | null
  /** Versão no ar (para a Gestão comparar). */
  versaoPublicada: { titulo: string; resumo: string; numero: number } | null
  pode: { editar: boolean; motivoBloqueio: string | null; enviar: boolean; cancelarEnvio: boolean; descartarRevisao: boolean; arquivar: boolean }
  publicadoEm: Date | null
  destaque: boolean
  historico: DecisaoHistorico[]
}

/**
 * Artigo para o formulário de edição (autor) ou para a tela de moderação
 * (Gestão, `autorId` nulo). Fora do escopo → `null` (sem revelar existência).
 */
export async function obterArtigoEmEdicao(
  artigoId: string,
  escopo: { tipo: 'profissional'; autorId: string } | { tipo: 'institucional' } | { tipo: 'gestao' },
): Promise<ArtigoEmEdicao | null> {
  const condicaoEscopo =
    escopo.tipo === 'profissional'
      ? and(eq(conhecimentoArtigos.autorId, escopo.autorId), eq(conhecimentoArtigos.tipoAutoria, 'profissional'))
      : escopo.tipo === 'institucional'
        ? eq(conhecimentoArtigos.tipoAutoria, 'institucional')
        : undefined
  const [linha] = await consultaArtigos()
    .where(and(eq(conhecimentoArtigos.id, artigoId), condicaoEscopo))
    .limit(1)
  if (!linha) return null

  const versoes = (await versoesDosArtigos([linha.id])).get(linha.id) ?? []
  const situacaoAtual = estado(linha.statusPublicacao, versoes)
  const trabalho = versaoDeTrabalho(versoes, linha.versaoPublicadaId)
  const publicada = versoes.find((versao) => versao.id === linha.versaoPublicadaId) ?? null
  const comObservacao = versoes.find(
    (versao) => (versao.status === 'devolvida' || versao.status === 'rejeitada') && versao.observacaoModeracao,
  )
  const decisao = decidirEdicao(situacaoAtual)
  const aberta = situacaoAtual.versaoAberta

  return {
    id: linha.id,
    slug: linha.slug,
    tipoAutoria: linha.tipoAutoria as 'profissional' | 'institucional',
    autorId: linha.autorId,
    autorNome: linha.autorNome,
    assinatura: linha.responsavelEditorialId ? 'responsavel' : 'vincis',
    situacao: situacaoEditorial(situacaoAtual),
    statusPublicacao: linha.statusPublicacao as StatusPublicacao,
    versaoAberta: aberta ? { id: (aberta as VersaoLida).id, numero: (aberta as VersaoLida).numero, status: aberta.status } : null,
    revisaoEmAndamento: temRevisaoEmAndamento(situacaoAtual),
    slugFixo: Boolean(linha.publicadoEm),
    dados: {
      titulo: trabalho?.titulo ?? '',
      slug: linha.slug,
      palavrasChave: trabalho?.palavrasChave ?? [],
      resumo: trabalho?.resumo ?? '',
      categoriaId: trabalho?.categoriaId ?? null,
      capaUrl: trabalho?.capaUrl ?? null,
      capaAlt: trabalho?.capaAlt ?? null,
      conteudo: lerConteudoArtigo(trabalho?.conteudo) ?? CONTEUDO_ARTIGO_VAZIO,
      fontes: trabalho?.fontes ?? [],
      tituloSeo: trabalho?.tituloSeo ?? null,
      descricaoSeo: trabalho?.descricaoSeo ?? null,
    },
    // Só mostra a orientação enquanto ela ainda diz respeito ao estado atual.
    observacaoModeracao:
      comObservacao && (aberta?.status === 'devolvida' || situacaoEditorial(situacaoAtual) === 'rejeitado')
        ? comObservacao.observacaoModeracao
        : null,
    versaoPublicada: publicada ? { titulo: publicada.titulo, resumo: publicada.resumo, numero: publicada.numero } : null,
    pode: {
      editar: decisao.tipo !== 'bloqueado',
      motivoBloqueio: decisao.tipo === 'bloqueado' ? decisao.motivo : null,
      enviar: decisao.tipo !== 'bloqueado' || podeEnviar(situacaoAtual),
      cancelarEnvio: podeCancelarEnvio(situacaoAtual),
      descartarRevisao: Boolean(aberta && linha.versaoPublicadaId && aberta.status !== 'aguardando_aprovacao'),
      arquivar: linha.statusPublicacao !== 'arquivado',
    },
    publicadoEm: linha.publicadoEm,
    destaque: linha.destaque,
    historico: await historico(linha.id),
  }
}

const autorResponsavel = alias(usuarios, 'responsavel_previa')

/**
 * Prévia privada: a versão de trabalho desenhada como o público a veria.
 * Quem chama garante que o leitor é o autor ou a Gestão; o escopo vai no WHERE.
 */
export async function obterPreviaDoArtigo(
  artigoId: string,
  leitor: { usuarioId: string; gestor: boolean },
): Promise<ArtigoCompleto | null> {
  const [linha] = await db
    .select({
      ...camposArtigo,
      autorAvatar: perfisProfissionais.avatarUrl,
      autorFotoDestaque: perfisProfissionais.fotoDestaqueUrl,
      autorTipoProfissional: perfisProfissionais.tipoProfissional,
      autorModalidade: perfisProfissionais.modalidadeAtuacao,
      autorEspecialidades: perfisProfissionais.especialidades,
      autorAreas: perfisProfissionais.areasAtuacao,
      autorCidade: perfisProfissionais.cidade,
      autorEstado: perfisProfissionais.estado,
      autorSlug: perfisProfissionais.slugPublico,
      responsavelNome: autorResponsavel.nome,
      autorIdentidade: usuarios.identidadePublica,
    })
    .from(conhecimentoArtigos)
    .innerJoin(usuarios, eq(usuarios.id, conhecimentoArtigos.autorId))
    .leftJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, conhecimentoArtigos.autorId))
    .leftJoin(autorResponsavel, eq(autorResponsavel.id, conhecimentoArtigos.responsavelEditorialId))
    .where(
      and(
        eq(conhecimentoArtigos.id, artigoId),
        leitor.gestor
          ? undefined
          : and(eq(conhecimentoArtigos.autorId, leitor.usuarioId), eq(conhecimentoArtigos.tipoAutoria, 'profissional')),
      ),
    )
    .limit(1)
  if (!linha) return null

  const versoes = (await versoesDosArtigos([linha.id])).get(linha.id) ?? []
  const versao = versaoDeTrabalho(versoes, linha.versaoPublicadaId)
  if (!versao) return null
  const conteudo = lerConteudoArtigo(versao.conteudo) ?? CONTEUDO_ARTIGO_VAZIO

  const [categoria] = versao.categoriaId
    ? await db
        .select({
          id: conhecimentoCategorias.id,
          nome: conhecimentoCategorias.nome,
          slug: conhecimentoCategorias.slug,
          descricao: conhecimentoCategorias.descricao,
          areaBusca: conhecimentoCategorias.areaBusca,
          chamadaConversao: conhecimentoCategorias.chamadaConversao,
        })
        .from(conhecimentoCategorias)
        .where(eq(conhecimentoCategorias.id, versao.categoriaId))
        .limit(1)
    : []

  const equipe = linha.autorIdentidade === 'equipe_vincis'
  const autor = montarAutorPublico({
    tipoAutoria: linha.tipoAutoria,
    autorId: linha.autorId,
    autorNome: linha.autorNome,
    identidadePublica: linha.autorIdentidade,
    avatarUrl: linha.autorAvatar ?? null,
    fotoDestaqueUrl: linha.autorFotoDestaque ?? null,
    tipoProfissional: linha.autorTipoProfissional ?? null,
    especialidades: linha.autorEspecialidades ?? null,
    areasAtuacao: linha.autorAreas ?? null,
    cidade: linha.autorCidade ?? null,
    estado: linha.autorEstado ?? null,
    slugPublico: linha.autorSlug ?? null,
    responsavelNome: linha.responsavelNome ?? null,
    escritorioNome:
      !equipe && linha.tipoAutoria === 'profissional' && linha.autorModalidade === 'escritorio'
        ? await nomeDoEscritorioPublico(linha.autorId)
        : null,
  })
  const agora = new Date()
  return {
    id: linha.id,
    slug: linha.slug,
    titulo: versao.titulo,
    resumo: versao.resumo,
    capaUrl: versao.capaUrl,
    capaAlt: versao.capaAlt,
    categoria: categoria ? { nome: categoria.nome, slug: categoria.slug } : null,
    categoriaCompleta: categoria
      ? { ...categoria, areaBusca: (categoria.areaBusca as 'contabilidade' | 'advocacia' | null) ?? null }
      : null,
    autor,
    publicadoEm: linha.publicadoEm ?? agora,
    atualizadoEm: versao.updatedAt,
    destaque: linha.destaque,
    conteudo,
    fontes: versao.fontes,
    palavrasChave: versao.palavrasChave,
    tituloSeo: versao.tituloSeo,
    descricaoSeo: versao.descricaoSeo,
    minutosLeitura: minutosDeLeitura(conteudo),
  }
}

/** Categorias para o formulário: ativas + a já escolhida (mesmo se desativada). */
export async function listarCategoriasParaFormulario(categoriaAtualId: string | null) {
  return db
    .select({ id: conhecimentoCategorias.id, nome: conhecimentoCategorias.nome, ativa: conhecimentoCategorias.ativa })
    .from(conhecimentoCategorias)
    .where(
      categoriaAtualId
        ? or(eq(conhecimentoCategorias.ativa, true), eq(conhecimentoCategorias.id, categoriaAtualId))
        : eq(conhecimentoCategorias.ativa, true),
    )
    .orderBy(asc(conhecimentoCategorias.ordem), asc(conhecimentoCategorias.nome))
}

/** Gestão de categorias: todas, com quantos artigos publicados cada uma tem. */
export async function listarCategoriasGestao() {
  const [categorias, usos] = await Promise.all([
    db.select().from(conhecimentoCategorias).orderBy(asc(conhecimentoCategorias.ordem), asc(conhecimentoCategorias.nome)),
    db
      .select({ categoriaId: conhecimentoArtigoVersoes.categoriaId, total: count() })
      .from(conhecimentoArtigos)
      .innerJoin(conhecimentoArtigoVersoes, eq(conhecimentoArtigoVersoes.id, conhecimentoArtigos.versaoPublicadaId))
      .where(eq(conhecimentoArtigos.statusPublicacao, 'publicado'))
      .groupBy(conhecimentoArtigoVersoes.categoriaId),
  ])
  const mapa = new Map(usos.map((uso) => [uso.categoriaId, uso.total]))
  return categorias.map((categoria) => ({ ...categoria, publicados: mapa.get(categoria.id) ?? 0 }))
}
