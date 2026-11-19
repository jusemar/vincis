import { and, desc, eq, inArray, like, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { conhecimentoArtigoVersoes, conhecimentoArtigos, conhecimentoCategorias } from '@/db/schema'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import {
  ACOES_EDITORIAIS,
  STATUS_VERSAO_EM_ABERTO,
  type StatusPublicacao,
  type StatusVersao,
} from '../constants/status'
import type { DadosArtigo } from '../schemas/artigo'
import { problemasParaEnvio } from '../schemas/artigo'
import { registrarDecisaoEditorial } from './auditoria'
import { decidirEdicao, podeCancelarEnvio, podeEnviar, type EstadoArtigo } from './fluxo-editorial'
import { escolherSlugArtigoLivre, montarBaseSlugArtigo } from './slug-artigo'

/**
 * Escrita do artigo pelo **autor** — o profissional dono ou, no institucional,
 * a Gestão. Regras puras em `fluxo-editorial.ts`; aqui ficam transação, trava
 * de linha e escopo.
 *
 * Escopo é o isolamento: um profissional só alcança artigos com
 * `autor_id = sessão` e `tipo_autoria = 'profissional'`; a Gestão, no papel de
 * autora, só os institucionais. O id do artigo vem do navegador; o escopo vem
 * sempre do servidor.
 */

export type EscopoAutoria =
  | { tipo: 'profissional'; autorId: string }
  | { tipo: 'institucional' }

/** Erro de regra editorial — a mensagem é segura para mostrar ao usuário. */
export class ErroEditorial extends Error {
  readonly problemas?: string[]

  constructor(mensagem: string, problemas?: string[]) {
    super(mensagem)
    this.problemas = problemas
  }
}

function condicaoEscopo(escopo: EscopoAutoria) {
  return escopo.tipo === 'profissional'
    ? and(eq(conhecimentoArtigos.autorId, escopo.autorId), eq(conhecimentoArtigos.tipoAutoria, 'profissional'))
    : eq(conhecimentoArtigos.tipoAutoria, 'institucional')
}

function origemDoEscopo(escopo: EscopoAutoria) {
  return escopo.tipo === 'profissional' ? ('admin' as const) : ('gestao_vincis' as const)
}

type ArtigoTravado = {
  id: string
  autorId: string
  slug: string
  statusPublicacao: StatusPublicacao
  publicadoEm: Date | null
  versaoPublicadaId: string | null
  versaoAberta: { id: string; status: StatusVersao; numero: number } | null
  ultimaVersao: { id: string; status: StatusVersao; numero: number } | null
}

/** Lê o artigo no escopo, com trava de linha (`FOR UPDATE`) — nulo se não for dele. */
export async function travarArtigo(
  tx: TransacaoDb,
  artigoId: string,
  escopo: EscopoAutoria | null,
): Promise<ArtigoTravado | null> {
  const [artigo] = await tx
    .select({
      id: conhecimentoArtigos.id,
      autorId: conhecimentoArtigos.autorId,
      slug: conhecimentoArtigos.slug,
      statusPublicacao: conhecimentoArtigos.statusPublicacao,
      publicadoEm: conhecimentoArtigos.publicadoEm,
      versaoPublicadaId: conhecimentoArtigos.versaoPublicadaId,
    })
    .from(conhecimentoArtigos)
    .where(escopo ? and(eq(conhecimentoArtigos.id, artigoId), condicaoEscopo(escopo)) : eq(conhecimentoArtigos.id, artigoId))
    .for('update')
    .limit(1)
  if (!artigo) return null

  const versoes = await tx
    .select({
      id: conhecimentoArtigoVersoes.id,
      status: conhecimentoArtigoVersoes.status,
      numero: conhecimentoArtigoVersoes.numero,
    })
    .from(conhecimentoArtigoVersoes)
    .where(eq(conhecimentoArtigoVersoes.artigoId, artigoId))
    .orderBy(desc(conhecimentoArtigoVersoes.numero))
    .limit(20)

  const tipadas = versoes.map((versao) => ({ ...versao, status: versao.status as StatusVersao }))
  return {
    ...artigo,
    statusPublicacao: artigo.statusPublicacao as StatusPublicacao,
    versaoAberta: tipadas.find((versao) => STATUS_VERSAO_EM_ABERTO.includes(versao.status)) ?? null,
    ultimaVersao: tipadas[0] ?? null,
  }
}

export function estadoDoArtigo(artigo: ArtigoTravado): EstadoArtigo {
  return {
    statusPublicacao: artigo.statusPublicacao,
    versaoAberta: artigo.versaoAberta,
    ultimaVersao: artigo.ultimaVersao,
  }
}

async function slugLivre(tx: TransacaoDb, titulo: string, ignorarArtigoId?: string): Promise<string> {
  const base = montarBaseSlugArtigo(titulo)
  const linhas = await tx
    .select({ slug: conhecimentoArtigos.slug, id: conhecimentoArtigos.id })
    .from(conhecimentoArtigos)
    .where(or(eq(conhecimentoArtigos.slug, base), like(conhecimentoArtigos.slug, `${base}-%`)))
  const ocupados = new Set(linhas.filter((linha) => linha.id !== ignorarArtigoId).map(({ slug }) => slug))
  return escolherSlugArtigoLivre(base, ocupados)
}

/** Sugestão livre a partir de um slug ocupado (`slug-2`, `slug-3`…). */
export async function sugerirSlugLivre(executor: TransacaoDb | typeof db, base: string, ignorarArtigoId?: string | null) {
  const linhas = await executor
    .select({ slug: conhecimentoArtigos.slug, id: conhecimentoArtigos.id })
    .from(conhecimentoArtigos)
    .where(or(eq(conhecimentoArtigos.slug, base), like(conhecimentoArtigos.slug, `${base}-%`)))
  const ocupados = new Set(linhas.filter((linha) => linha.id !== ignorarArtigoId).map(({ slug }) => slug))
  return { ocupado: ocupados.has(base), sugestao: escolherSlugArtigoLivre(base, ocupados) }
}

/**
 * Endereço do artigo antes da primeira publicação:
 * - escolhido pelo autor (`dados.slug`): usado exatamente como está — se outro
 *   artigo já usa, recusa com uma sugestão, em vez de trocar em silêncio;
 * - não escolhido: gerado do título, com sufixo numérico se preciso.
 */
async function resolverSlug(tx: TransacaoDb, dados: DadosArtigo, artigoId?: string): Promise<string> {
  if (!dados.slug) return slugLivre(tx, dados.titulo, artigoId)
  const { ocupado, sugestao } = await sugerirSlugLivre(tx, dados.slug, artigoId)
  if (ocupado)
    throw new ErroEditorial('Esta URL amigável já está em uso por outro artigo.', [
      `URL indisponível: /conhecimento/${dados.slug}. Sugestão: ${sugestao}`,
    ])
  return dados.slug
}

async function conferirCategoria(tx: TransacaoDb, categoriaId: string | null, exigirAtiva: boolean) {
  if (!categoriaId) return
  const [categoria] = await tx
    .select({ ativa: conhecimentoCategorias.ativa })
    .from(conhecimentoCategorias)
    .where(eq(conhecimentoCategorias.id, categoriaId))
    .limit(1)
  if (!categoria) throw new ErroEditorial('Categoria inexistente.')
  if (exigirAtiva && !categoria.ativa) throw new ErroEditorial('Esta categoria não está mais disponível. Escolha outra.')
}

function camposDaVersao(dados: DadosArtigo) {
  return {
    titulo: dados.titulo,
    resumo: dados.resumo,
    categoriaId: dados.categoriaId,
    capaUrl: dados.capaUrl,
    capaAlt: dados.capaAlt,
    conteudo: dados.conteudo as unknown as Record<string, unknown>,
    fontes: dados.fontes,
    palavrasChave: dados.palavrasChave,
    tituloSeo: dados.tituloSeo,
    descricaoSeo: dados.descricaoSeo,
  }
}

/** Cria o artigo e a versão 1 (rascunho). */
export async function criarArtigoComRascunho(params: {
  executorId: string
  tipoAutoria: 'profissional' | 'institucional'
  autorId: string
  responsavelEditorialId: string | null
  dados: DadosArtigo
}): Promise<{ artigoId: string }> {
  return db.transaction(async (tx) => {
    await conferirCategoria(tx, params.dados.categoriaId, true)
    const slug = await resolverSlug(tx, params.dados)
    const [artigo] = await tx
      .insert(conhecimentoArtigos)
      .values({
        autorId: params.autorId,
        tipoAutoria: params.tipoAutoria,
        responsavelEditorialId: params.responsavelEditorialId,
        slug,
      })
      .returning({ id: conhecimentoArtigos.id })
    const [versao] = await tx
      .insert(conhecimentoArtigoVersoes)
      .values({ artigoId: artigo.id, numero: 1, status: 'rascunho', criadaPorId: params.executorId, ...camposDaVersao(params.dados) })
      .returning({ id: conhecimentoArtigoVersoes.id })
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: versao.id,
      acao: ACOES_EDITORIAIS.criado,
      executorId: params.executorId,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoCriado,
        origem: params.tipoAutoria === 'profissional' ? 'admin' : 'gestao_vincis',
        usuarioId: params.autorId,
        metadados: { slug, tipoAutoria: params.tipoAutoria },
      },
    })
    return { artigoId: artigo.id }
  })
}

/**
 * Salva o texto. Edita a versão em aberto, ou abre uma revisão nova quando o
 * artigo está publicado/despublicado — o texto no ar não é tocado.
 */
export async function salvarTextoDoArtigo(params: {
  executorId: string
  artigoId: string
  escopo: EscopoAutoria
  dados: DadosArtigo
}): Promise<{ versaoId: string; revisaoAberta: boolean }> {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, params.escopo)
    if (!artigo) throw new ErroEditorial('Artigo não encontrado.')
    const decisao = decidirEdicao(estadoDoArtigo(artigo))
    if (decisao.tipo === 'bloqueado') throw new ErroEditorial(decisao.motivo)
    await conferirCategoria(tx, params.dados.categoriaId, false)

    // Antes da primeira publicação o endereço pode mudar (título ou escolha do
    // autor); depois da primeira publicação fica fixo — canonical, sitemap e
    // links compartilhados nunca quebram.
    if (!artigo.publicadoEm) {
      const slug = await resolverSlug(tx, params.dados, artigo.id)
      if (slug !== artigo.slug)
        await tx.update(conhecimentoArtigos).set({ slug, updatedAt: new Date() }).where(eq(conhecimentoArtigos.id, artigo.id))
    }

    if (decisao.tipo === 'editar_aberta' && artigo.versaoAberta) {
      await tx
        .update(conhecimentoArtigoVersoes)
        .set({ ...camposDaVersao(params.dados), updatedAt: new Date() })
        .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
      await tx.update(conhecimentoArtigos).set({ updatedAt: new Date() }).where(eq(conhecimentoArtigos.id, artigo.id))
      return { versaoId: artigo.versaoAberta.id, revisaoAberta: false }
    }

    const [versao] = await tx
      .insert(conhecimentoArtigoVersoes)
      .values({
        artigoId: artigo.id,
        numero: (artigo.ultimaVersao?.numero ?? 0) + 1,
        status: 'rascunho',
        criadaPorId: params.executorId,
        ...camposDaVersao(params.dados),
      })
      .returning({ id: conhecimentoArtigoVersoes.id })
    await tx.update(conhecimentoArtigos).set({ updatedAt: new Date() }).where(eq(conhecimentoArtigos.id, artigo.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: versao.id,
      acao: ACOES_EDITORIAIS.revisaoIniciada,
      executorId: params.executorId,
    })
    return { versaoId: versao.id, revisaoAberta: true }
  })
}

/** Envia a versão em aberto para a fila de moderação. */
export async function enviarParaAprovacao(params: {
  executorId: string
  artigoId: string
  escopo: EscopoAutoria
  dados: DadosArtigo
}): Promise<void> {
  const problemas = problemasParaEnvio(params.dados)
  if (problemas.length) throw new ErroEditorial('Complete o artigo antes de enviar.', problemas)

  // Grava o texto atual primeiro (mesmas regras de "salvar").
  await salvarTextoDoArtigo(params)

  await db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, params.escopo)
    if (!artigo?.versaoAberta || !podeEnviar(estadoDoArtigo(artigo)))
      throw new ErroEditorial('Este artigo não pode ser enviado agora.')
    await conferirCategoria(tx, params.dados.categoriaId, true)
    const agora = new Date()
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({ status: 'aguardando_aprovacao', enviadaEm: agora, updatedAt: agora })
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta.id,
      acao: ACOES_EDITORIAIS.enviado,
      executorId: params.executorId,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoEnviado,
        origem: origemDoEscopo(params.escopo),
        usuarioId: artigo.autorId,
        metadados: { numeroVersao: artigo.versaoAberta.numero, revisaoDePublicado: artigo.statusPublicacao === 'publicado' },
      },
    })
  })
}

/** Retira da fila: a versão volta a rascunho e pode ser editada. */
export async function cancelarEnvio(params: { executorId: string; artigoId: string; escopo: EscopoAutoria }) {
  await db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, params.escopo)
    if (!artigo?.versaoAberta || !podeCancelarEnvio(estadoDoArtigo(artigo)))
      throw new ErroEditorial('Não há envio a cancelar.')
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({ status: 'rascunho', enviadaEm: null, updatedAt: new Date() })
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta.id,
      acao: ACOES_EDITORIAIS.envioCancelado,
      executorId: params.executorId,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoEnvioCancelado,
        origem: origemDoEscopo(params.escopo),
        usuarioId: artigo.autorId,
      },
    })
  })
}

/**
 * Desiste da revisão de um artigo que já foi publicado: a versão em aberto vira
 * `descartada` e o texto aprovado continua valendo. Num artigo que nunca foi
 * ao ar não há "texto anterior" — ali o caminho é arquivar.
 */
export async function descartarRevisao(params: { executorId: string; artigoId: string; escopo: EscopoAutoria }) {
  await db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, params.escopo)
    if (!artigo?.versaoAberta || !artigo.versaoPublicadaId)
      throw new ErroEditorial('Não há revisão a descartar.')
    if (artigo.versaoAberta.status === 'aguardando_aprovacao')
      throw new ErroEditorial('Cancele o envio antes de descartar a revisão.')
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({ status: 'descartada', updatedAt: new Date() })
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta.id,
      acao: ACOES_EDITORIAIS.revisaoDescartada,
      executorId: params.executorId,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoRevisaoDescartada,
        origem: origemDoEscopo(params.escopo),
        usuarioId: artigo.autorId,
      },
    })
  })
}

/** Arquivamento pelo próprio autor (sai do ar se estava publicado). */
export async function arquivarPeloAutor(params: { executorId: string; artigoId: string; escopo: EscopoAutoria }) {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, params.escopo)
    if (!artigo) throw new ErroEditorial('Artigo não encontrado.')
    if (artigo.statusPublicacao === 'arquivado') throw new ErroEditorial('O artigo já está arquivado.')
    const agora = new Date()
    await tx
      .update(conhecimentoArtigos)
      .set({ statusPublicacao: 'arquivado', destaque: false, updatedAt: agora })
      .where(eq(conhecimentoArtigos.id, artigo.id))
    // Uma versão em aberto não pode ficar pendurada na fila de quem arquivou.
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({ status: 'descartada', updatedAt: agora })
      .where(
        and(
          eq(conhecimentoArtigoVersoes.artigoId, artigo.id),
          inArray(conhecimentoArtigoVersoes.status, [...STATUS_VERSAO_EM_ABERTO]),
        ),
      )
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta?.id ?? null,
      acao: ACOES_EDITORIAIS.arquivado,
      executorId: params.executorId,
      observacao: 'Arquivado pelo autor.',
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoArquivado,
        origem: origemDoEscopo(params.escopo),
        usuarioId: artigo.autorId,
        metadados: { pelo: 'autor', estavaPublicado: artigo.statusPublicacao === 'publicado' },
      },
    })
    return { slug: artigo.slug }
  })
}

/** Slug atual de um artigo (para revalidar a página pública depois da escrita). */
export async function slugDoArtigo(artigoId: string): Promise<string | null> {
  const [linha] = await db
    .select({ slug: conhecimentoArtigos.slug })
    .from(conhecimentoArtigos)
    .where(eq(conhecimentoArtigos.id, artigoId))
    .limit(1)
  return linha?.slug ?? null
}
