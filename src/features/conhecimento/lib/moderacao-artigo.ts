import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { conhecimentoArtigoVersoes, conhecimentoArtigos, perfisProfissionais, usuarios } from '@/db/schema'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { ACOES_EDITORIAIS } from '../constants/status'
import { lerConteudoArtigo } from './conteudo/schema-conteudo'
import { registrarDecisaoEditorial } from './auditoria'
import { ErroEditorial, travarArtigo } from './edicao-artigo'
import { aplicarAcaoPublicacao, resolverPublicadoEm, type AcaoPublicacao } from './fluxo-editorial'

/**
 * Decisões da Gestão. Quem chama já passou por `obterModeradorDaSessao`.
 *
 * A Vincis modera conteúdo jurídico e tributário: aprovar é a única forma de um
 * texto chegar ao público, e a versão aprovada fica congelada (revisões criam
 * versões novas). Toda decisão vai para o histórico e para a auditoria.
 */

/** Autor profissional ainda pode ter artigo no ar? (conta ativa e prestador público) */
async function autorProfissionalAtivo(tx: TransacaoDb, autorId: string): Promise<boolean> {
  const [linha] = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(and(eq(usuarios.id, autorId), eq(usuarios.status, 'ativo'), condicaoContaVerificada(), condicaoPrestadorPublico()))
    .limit(1)
  return Boolean(linha)
}

async function tipoAutoria(tx: TransacaoDb, artigoId: string) {
  const [linha] = await tx
    .select({ tipo: conhecimentoArtigos.tipoAutoria })
    .from(conhecimentoArtigos)
    .where(eq(conhecimentoArtigos.id, artigoId))
    .limit(1)
  return linha?.tipo ?? null
}

/**
 * Aprova a versão em análise e a coloca no ar.
 *
 * Institucional: a Gestão é a própria autora, então pode aprovar direto do
 * rascunho. Profissional: só versão `aguardando_aprovacao`.
 */
export async function aprovarVersao(params: { gestorId: string; artigoId: string; observacao: string | null }) {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, null)
    if (!artigo?.versaoAberta) throw new ErroEditorial('Não há versão para aprovar.')
    if (artigo.statusPublicacao === 'arquivado') throw new ErroEditorial('Artigo arquivado.')
    const institucional = (await tipoAutoria(tx, artigo.id)) === 'institucional'
    const aceitaStatus = institucional
      ? ['rascunho', 'aguardando_aprovacao', 'devolvida'].includes(artigo.versaoAberta.status)
      : artigo.versaoAberta.status === 'aguardando_aprovacao'
    if (!aceitaStatus) throw new ErroEditorial('Esta versão não está aguardando aprovação.')
    if (!institucional && !(await autorProfissionalAtivo(tx, artigo.autorId)))
      throw new ErroEditorial('O autor não tem mais perfil público ativo. Não é possível publicar.')

    const [versao] = await tx
      .select({
        conteudo: conhecimentoArtigoVersoes.conteudo,
        categoriaId: conhecimentoArtigoVersoes.categoriaId,
        titulo: conhecimentoArtigoVersoes.titulo,
      })
      .from(conhecimentoArtigoVersoes)
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
      .limit(1)
    // Revalida o corpo contra a lista fechada antes de publicar.
    if (!versao || !lerConteudoArtigo(versao.conteudo)) throw new ErroEditorial('O conteúdo desta versão é inválido.')
    if (!versao.categoriaId) throw new ErroEditorial('A versão precisa de uma categoria para ser publicada.')

    const agora = new Date()
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({
        status: 'aprovada',
        decididaEm: agora,
        decididaPorId: params.gestorId,
        observacaoModeracao: params.observacao,
        updatedAt: agora,
      })
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await tx
      .update(conhecimentoArtigos)
      .set({
        statusPublicacao: 'publicado',
        versaoPublicadaId: artigo.versaoAberta.id,
        publicadoEm: resolverPublicadoEm(artigo.publicadoEm, agora),
        atualizadoPublicoEm: agora,
        updatedAt: agora,
      })
      .where(eq(conhecimentoArtigos.id, artigo.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta.id,
      acao: ACOES_EDITORIAIS.aprovado,
      executorId: params.gestorId,
      observacao: params.observacao,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoAprovado,
        origem: 'gestao_vincis',
        usuarioId: artigo.autorId,
        metadados: {
          slug: artigo.slug,
          numeroVersao: artigo.versaoAberta.numero,
          substituiu: artigo.versaoPublicadaId,
        },
      },
    })
    return { slug: artigo.slug, autorId: artigo.autorId }
  })
}

/** Devolve para ajustes (observação obrigatória) ou rejeita em definitivo. */
export async function decidirContraVersao(params: {
  gestorId: string
  artigoId: string
  decisao: 'devolver' | 'rejeitar'
  observacao: string
}) {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, null)
    if (!artigo?.versaoAberta || artigo.versaoAberta.status !== 'aguardando_aprovacao')
      throw new ErroEditorial('Não há versão aguardando aprovação.')
    const agora = new Date()
    const devolver = params.decisao === 'devolver'
    await tx
      .update(conhecimentoArtigoVersoes)
      .set({
        status: devolver ? 'devolvida' : 'rejeitada',
        observacaoModeracao: params.observacao,
        decididaEm: agora,
        decididaPorId: params.gestorId,
        updatedAt: agora,
      })
      .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await tx.update(conhecimentoArtigos).set({ updatedAt: agora }).where(eq(conhecimentoArtigos.id, artigo.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoAberta.id,
      acao: devolver ? ACOES_EDITORIAIS.devolvido : ACOES_EDITORIAIS.rejeitado,
      executorId: params.gestorId,
      observacao: params.observacao,
      auditoria: {
        acao: devolver ? ACOES_AUDITORIA.conhecimentoArtigoDevolvido : ACOES_AUDITORIA.conhecimentoArtigoRejeitado,
        origem: 'gestao_vincis',
        usuarioId: artigo.autorId,
        metadados: { numeroVersao: artigo.versaoAberta.numero, publicadoContinuaNoAr: artigo.statusPublicacao === 'publicado' },
      },
    })
    return { slug: artigo.slug, autorId: artigo.autorId }
  })
}

const ACAO_HISTORICO = {
  despublicar: ACOES_EDITORIAIS.despublicado,
  republicar: ACOES_EDITORIAIS.republicado,
  arquivar: ACOES_EDITORIAIS.arquivado,
} as const
const ACAO_AUDITORIA = {
  despublicar: ACOES_AUDITORIA.conhecimentoArtigoDespublicado,
  republicar: ACOES_AUDITORIA.conhecimentoArtigoRepublicado,
  arquivar: ACOES_AUDITORIA.conhecimentoArtigoArquivado,
} as const

/** Despublicar, publicar de novo (a última versão aprovada) ou arquivar. */
export async function alterarPublicacao(params: {
  gestorId: string
  artigoId: string
  acao: AcaoPublicacao
  observacao: string | null
}) {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, null)
    if (!artigo) throw new ErroEditorial('Artigo não encontrado.')
    const novo = aplicarAcaoPublicacao(artigo.statusPublicacao, params.acao, Boolean(artigo.versaoPublicadaId))
    if (!novo) throw new ErroEditorial('Esta ação não vale para o estado atual do artigo.')
    if (params.acao === 'republicar') {
      const institucional = (await tipoAutoria(tx, artigo.id)) === 'institucional'
      if (!institucional && !(await autorProfissionalAtivo(tx, artigo.autorId)))
        throw new ErroEditorial('O autor não tem mais perfil público ativo.')
    }
    const agora = new Date()
    await tx
      .update(conhecimentoArtigos)
      .set({
        statusPublicacao: novo,
        // Fora do ar não é destaque.
        ...(novo !== 'publicado' ? { destaque: false } : {}),
        updatedAt: agora,
      })
      .where(eq(conhecimentoArtigos.id, artigo.id))
    if (params.acao === 'arquivar' && artigo.versaoAberta)
      await tx
        .update(conhecimentoArtigoVersoes)
        .set({ status: 'descartada', updatedAt: agora })
        .where(eq(conhecimentoArtigoVersoes.id, artigo.versaoAberta.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoPublicadaId,
      acao: ACAO_HISTORICO[params.acao],
      executorId: params.gestorId,
      observacao: params.observacao,
      auditoria: {
        acao: ACAO_AUDITORIA[params.acao],
        origem: 'gestao_vincis',
        usuarioId: artigo.autorId,
        metadados: { de: artigo.statusPublicacao, para: novo, slug: artigo.slug },
      },
    })
    return { slug: artigo.slug, autorId: artigo.autorId }
  })
}

/** Liga/desliga o destaque na Central. Só artigo publicado. */
export async function alterarDestaque(params: { gestorId: string; artigoId: string; destaque: boolean }) {
  return db.transaction(async (tx) => {
    const artigo = await travarArtigo(tx, params.artigoId, null)
    if (!artigo) throw new ErroEditorial('Artigo não encontrado.')
    if (params.destaque && artigo.statusPublicacao !== 'publicado')
      throw new ErroEditorial('Só artigos publicados podem ser destacados.')
    await tx
      .update(conhecimentoArtigos)
      .set({ destaque: params.destaque, updatedAt: new Date() })
      .where(eq(conhecimentoArtigos.id, artigo.id))
    await registrarDecisaoEditorial(tx, {
      artigoId: artigo.id,
      versaoId: artigo.versaoPublicadaId,
      acao: params.destaque ? ACOES_EDITORIAIS.destacado : ACOES_EDITORIAIS.destaqueRemovido,
      executorId: params.gestorId,
      auditoria: {
        acao: ACOES_AUDITORIA.conhecimentoArtigoDestaqueAlterado,
        origem: 'gestao_vincis',
        usuarioId: artigo.autorId,
        metadados: { destaque: params.destaque },
      },
    })
    return { slug: artigo.slug }
  })
}
