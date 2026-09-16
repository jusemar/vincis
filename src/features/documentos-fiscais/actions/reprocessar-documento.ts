'use server'

import { z } from 'zod'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { LIMITE_REPROCESSAMENTO_EM_LOTE } from '../constants/operacao-fiscal'
import { reprocessarDocumentoFiscal } from '../lib/reprocessar-documento-fiscal'

/**
 * Entrada da aplicação para o reprocessamento fiscal (Fase 1.6).
 *
 * Server Action, como o resto das operações do Vincis — a rota HTTP do módulo
 * existe só para o upload, por causa do tamanho do corpo. Aqui a action apenas
 * autentica e delega: quem resolve escritório, permissão (`documentos_fiscais.revisar`)
 * e existência do documento continua sendo a função de domínio da Fase 1.5.
 *
 * Documento de outro escritório, inexistente ou sem permissão recebem a mesma
 * resposta — a action não revela qual dos três é o caso. A auditoria é a que a
 * 1.5 já grava dentro da transação: esta camada não registra um segundo evento
 * para a mesma operação.
 *
 * O retorno é pequeno de propósito: nada de XML, chave de storage, SQL ou stack.
 */

const DocumentoIdSchema = z.string().uuid()

const MENSAGENS = {
  REPROCESSADO: 'Documento reprocessado com a versão atual do leitor fiscal.',
  NAO_INTERPRETADO: 'O arquivo continua sem poder ser interpretado. Ele segue guardado para uma próxima tentativa.',
  SEM_PERMISSAO: 'Documento não encontrado ou sem autorização para reprocessar.',
  ARQUIVO_INDISPONIVEL: 'O arquivo original não pôde ser lido. Tente novamente mais tarde.',
  ARQUIVO_RECUSADO: 'O arquivo original não passou na verificação de segurança.',
  DOCUMENTO_DUPLICADO: 'A nota deste arquivo já está importada para este contribuinte.',
  FALHA_REGISTRO: 'Não foi possível concluir o reprocessamento. Tente novamente.',
  REQUISICAO_INVALIDA: 'Documento inválido.',
} as const

export type RespostaReprocessamento = {
  sucesso: boolean
  codigo: keyof typeof MENSAGENS
  mensagem: string
  documentoId: string | null
  /** Situação do processamento depois da tentativa. */
  status: 'processado' | 'falhou' | null
  /** `emitido`, `recebido` ou `nao_determinado`, quando houve leitura. */
  sentido: string | null
}

export async function reprocessarDocumentoFiscalAction(
  documentoId: unknown,
): Promise<RespostaReprocessamento> {
  const id = DocumentoIdSchema.safeParse(documentoId)
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return { sucesso: false, codigo: 'SEM_PERMISSAO', mensagem: MENSAGENS.SEM_PERMISSAO, documentoId: null, status: null, sentido: null }
  }
  if (!id.success) {
    return { sucesso: false, codigo: 'REQUISICAO_INVALIDA', mensagem: MENSAGENS.REQUISICAO_INVALIDA, documentoId: null, status: null, sentido: null }
  }

  const resultado = await reprocessarDocumentoFiscal({ usuarioId: sessao.id, documentoId: id.data })

  if (resultado.sucesso) {
    return {
      sucesso: true,
      codigo: 'REPROCESSADO',
      mensagem: MENSAGENS.REPROCESSADO,
      documentoId: resultado.documentoId,
      status: 'processado',
      sentido: resultado.sentido,
    }
  }

  return {
    sucesso: false,
    codigo: resultado.codigo,
    mensagem: MENSAGENS[resultado.codigo],
    // O id só volta para quem já o tinha; nada é revelado sobre outro escritório.
    documentoId: resultado.codigo === 'SEM_PERMISSAO' ? null : resultado.documentoId,
    status: resultado.codigo === 'NAO_INTERPRETADO' ? 'falhou' : null,
    sentido: null,
  }
}

export type RespostaReprocessamentoEmLote = {
  sucesso: boolean
  mensagem: string
  resumo: {
    selecionados: number
    reprocessados: number
    naoInterpretados: number
    naoElegiveis: number
  }
}

/**
 * Reprocessamento de uma seleção.
 *
 * Síncrono e conservador: os documentos são relidos **em série**, até
 * `LIMITE_REPROCESSAMENTO_EM_LOTE` por ação, reaproveitando exatamente a mesma
 * função de domínio do reprocessamento individual — o parser não é chamado de
 * outro jeito aqui. Nada de fila, worker ou trabalho em segundo plano nesta
 * etapa: a ação termina antes de responder, e o resumo diz o que aconteceu com
 * cada documento.
 *
 * Cada documento é autorizado por si; o que está fora do escopo entra como não
 * elegível, sem revelar que existe.
 */
export async function reprocessarDocumentosFiscaisEmLote(
  documentoIds: unknown,
): Promise<RespostaReprocessamentoEmLote> {
  const vazio = { selecionados: 0, reprocessados: 0, naoInterpretados: 0, naoElegiveis: 0 }
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return { sucesso: false, mensagem: MENSAGENS.SEM_PERMISSAO, resumo: vazio }
  }
  const selecao = z.array(DocumentoIdSchema).min(1).max(LIMITE_REPROCESSAMENTO_EM_LOTE).safeParse(documentoIds)
  if (!selecao.success) {
    return {
      sucesso: false,
      mensagem: `Selecione entre 1 e ${LIMITE_REPROCESSAMENTO_EM_LOTE} documentos para reprocessar.`,
      resumo: vazio,
    }
  }

  const ids = [...new Set(selecao.data)]
  const resumo = { selecionados: ids.length, reprocessados: 0, naoInterpretados: 0, naoElegiveis: 0 }
  for (const documentoId of ids) {
    const resultado = await reprocessarDocumentoFiscal({ usuarioId: sessao.id, documentoId })
    if (resultado.sucesso) resumo.reprocessados += 1
    else if (resultado.codigo === 'NAO_INTERPRETADO') resumo.naoInterpretados += 1
    else resumo.naoElegiveis += 1
  }

  const partes = [`${resumo.reprocessados} reprocessados`]
  if (resumo.naoInterpretados) partes.push(`${resumo.naoInterpretados} ainda não interpretados`)
  if (resumo.naoElegiveis) partes.push(`${resumo.naoElegiveis} não elegíveis`)
  return {
    sucesso: resumo.reprocessados > 0,
    mensagem: `${resumo.selecionados} selecionados · ${partes.join(' · ')}.`,
    resumo,
  }
}
