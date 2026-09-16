'use server'

import { z } from 'zod'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
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
