'use server'

import { z } from 'zod'
import { obterModeradorDaSessao } from '../lib/autorizacao'
import {
  arquivarPeloAutor,
  criarArtigoComRascunho,
  descartarRevisao,
  salvarTextoDoArtigo,
  slugDoArtigo,
} from '../lib/edicao-artigo'
import { alterarDestaque, alterarPublicacao, aprovarVersao, decidirContraVersao } from '../lib/moderacao-artigo'
import { SEM_PERMISSAO, respostaDeErro, type RespostaAcao } from '../lib/respostas'
import { revalidarConhecimento } from '../lib/revalidacao'
import {
  dadosArtigoSchema,
  identificadorSchema,
  observacaoObrigatoriaSchema,
  observacaoSchema,
  problemasParaEnvio,
} from '../schemas/artigo'

/**
 * Ações da **Gestão Vincis** (moderação e artigos institucionais).
 * Toda chamada relê a sessão e o perfil (`validarGestorVincis`).
 */

const decisaoSchema = z.discriminatedUnion('decisao', [
  z.object({ artigoId: identificadorSchema, decisao: z.literal('aprovar'), observacao: observacaoSchema.optional() }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('devolver'), observacao: observacaoObrigatoriaSchema }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('rejeitar'), observacao: observacaoObrigatoriaSchema }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('despublicar'), observacao: observacaoSchema.optional() }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('republicar'), observacao: observacaoSchema.optional() }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('arquivar'), observacao: observacaoSchema.optional() }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('destacar') }),
  z.object({ artigoId: identificadorSchema, decisao: z.literal('remover_destaque') }),
])

const MENSAGENS = {
  aprovar: 'Artigo aprovado e publicado.',
  devolver: 'Artigo devolvido ao autor para ajustes.',
  rejeitar: 'Artigo rejeitado.',
  despublicar: 'Artigo retirado do ar.',
  republicar: 'Artigo publicado novamente.',
  arquivar: 'Artigo arquivado.',
  destacar: 'Artigo destacado na Central.',
  remover_destaque: 'Destaque removido.',
} as const

export async function decidirArtigo(entrada: unknown): Promise<RespostaAcao> {
  const gestor = await obterModeradorDaSessao()
  if (!gestor) return SEM_PERMISSAO
  const validacao = decisaoSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar decisão')
  const dados = validacao.data
  const base = { gestorId: gestor.id, artigoId: dados.artigoId }
  try {
    let slug: string | null = null
    switch (dados.decisao) {
      case 'aprovar':
        slug = (await aprovarVersao({ ...base, observacao: dados.observacao || null })).slug
        break
      case 'devolver':
      case 'rejeitar':
        slug = (await decidirContraVersao({ ...base, decisao: dados.decisao, observacao: dados.observacao })).slug
        break
      case 'despublicar':
      case 'republicar':
      case 'arquivar':
        slug = (await alterarPublicacao({ ...base, acao: dados.decisao, observacao: dados.observacao || null })).slug
        break
      case 'destacar':
      case 'remover_destaque':
        slug = (await alterarDestaque({ ...base, destaque: dados.decisao === 'destacar' })).slug
        break
    }
    revalidarConhecimento(slug)
    return { sucesso: true, mensagem: MENSAGENS[dados.decisao] }
  } catch (erro) {
    return respostaDeErro(erro, `decisão ${dados.decisao}`)
  }
}

const institucionalSchema = z.object({
  artigoId: identificadorSchema.nullable().optional(),
  dados: dadosArtigoSchema,
  /** Assinatura: "Vincis" ou o próprio Gestor como responsável editorial. */
  assinatura: z.enum(['vincis', 'responsavel']),
  intencao: z.enum(['rascunho', 'publicar']),
})

/**
 * Artigo institucional: a Gestão é autora e moderadora. Publicar aqui é salvar
 * e aprovar a versão na mesma ação — com o mesmo histórico e auditoria.
 * A assinatura nunca é texto livre: ou "Vincis", ou o Gestor da sessão.
 */
export async function salvarArtigoInstitucional(
  entrada: unknown,
): Promise<RespostaAcao<{ artigoId: string }>> {
  const gestor = await obterModeradorDaSessao()
  if (!gestor) return SEM_PERMISSAO
  const validacao = institucionalSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar institucional')
  const { artigoId, dados, assinatura, intencao } = validacao.data
  try {
    let id = artigoId ?? null
    if (!id) {
      id = (
        await criarArtigoComRascunho({
          executorId: gestor.id,
          tipoAutoria: 'institucional',
          autorId: gestor.id,
          responsavelEditorialId: assinatura === 'responsavel' ? gestor.id : null,
          dados,
        })
      ).artigoId
    } else {
      await salvarTextoDoArtigo({ executorId: gestor.id, artigoId: id, escopo: { tipo: 'institucional' }, dados })
    }
    if (intencao === 'publicar') {
      const problemas = problemasParaEnvio(dados)
      if (problemas.length) return { sucesso: false, mensagem: 'Complete o artigo antes de publicar.', problemas }
      await aprovarVersao({ gestorId: gestor.id, artigoId: id, observacao: null })
    }
    revalidarConhecimento(await slugDoArtigo(id))
    return { sucesso: true, mensagem: intencao === 'publicar' ? 'Artigo publicado.' : 'Rascunho salvo.', artigoId: id }
  } catch (erro) {
    return respostaDeErro(erro, 'salvar institucional')
  }
}

const operacaoInstitucionalSchema = z.object({
  artigoId: identificadorSchema,
  operacao: z.enum(['descartar_revisao', 'arquivar']),
})

export async function operarArtigoInstitucional(entrada: unknown): Promise<RespostaAcao> {
  const gestor = await obterModeradorDaSessao()
  if (!gestor) return SEM_PERMISSAO
  const validacao = operacaoInstitucionalSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar operação institucional')
  const { artigoId, operacao } = validacao.data
  const params = { executorId: gestor.id, artigoId, escopo: { tipo: 'institucional' as const } }
  try {
    if (operacao === 'descartar_revisao') await descartarRevisao(params)
    else await arquivarPeloAutor(params)
    revalidarConhecimento(await slugDoArtigo(artigoId))
    return { sucesso: true, mensagem: operacao === 'arquivar' ? 'Artigo arquivado.' : 'Revisão descartada.' }
  } catch (erro) {
    return respostaDeErro(erro, `institucional ${operacao}`)
  }
}
