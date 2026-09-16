'use server'

import { z } from 'zod'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { LIMITE_REVISAO_EM_LOTE } from '../constants/operacao-fiscal'
import { aplicarRevisaoNoDocumento } from '../lib/revisar-documento-fiscal'

/**
 * Revisão pela interface — de um documento ou de uma seleção.
 *
 * A regra vive em `lib/revisar-documento-fiscal`; aqui só entram sessão,
 * validação da entrada e o formato da resposta. Cada documento do lote é
 * autorizado no servidor, um a um: a seleção que chega do navegador não vale
 * como permissão, e documento fora do escopo entra na contagem de "não
 * elegíveis" sem ser distinguido de um que não existe.
 */

const DocumentoIdSchema = z.string().uuid()
const SelecaoSchema = z.array(DocumentoIdSchema).min(1).max(LIMITE_REVISAO_EM_LOTE)

export type RespostaRevisao = {
  sucesso: boolean
  mensagem: string
  documentoId: string | null
  statusRevisao: 'pendente' | 'revisado' | null
}

export type RespostaRevisaoEmLote = {
  sucesso: boolean
  mensagem: string
  resumo: {
    selecionados: number
    revisados: number
    jaRevisados: number
    naoElegiveis: number
  }
}

const NAO_AUTORIZADO: RespostaRevisao = {
  sucesso: false,
  mensagem: 'Documento não encontrado ou sem autorização para revisar.',
  documentoId: null,
  statusRevisao: null,
}

async function revisarUm(documentoId: unknown, destino: 'revisado' | 'pendente'): Promise<RespostaRevisao> {
  const sessao = await obterSessaoServidor()
  const id = DocumentoIdSchema.safeParse(documentoId)
  if (!sessao || !id.success) return NAO_AUTORIZADO

  const estado = await aplicarRevisaoNoDocumento(sessao.id, id.data, destino)
  if (estado === 'sem_acesso') return NAO_AUTORIZADO
  if (estado === 'nao_interpretado') {
    return {
      sucesso: false,
      mensagem: 'Este documento ainda não foi interpretado. Reprocesse antes de revisar.',
      documentoId: id.data,
      statusRevisao: 'pendente',
    }
  }

  return {
    sucesso: true,
    mensagem:
      estado === 'ja_estava'
        ? destino === 'revisado'
          ? 'Documento já estava revisado.'
          : 'Revisão já estava pendente.'
        : destino === 'revisado'
          ? 'Documento marcado como revisado.'
          : 'Revisão reaberta.',
    documentoId: id.data,
    statusRevisao: destino,
  }
}

export async function marcarDocumentoFiscalRevisado(documentoId: unknown) {
  return revisarUm(documentoId, 'revisado')
}

/** Reabrir é o mesmo ato, ao contrário — e do mesmo perfil que revisa. */
export async function reabrirRevisaoDocumentoFiscal(documentoId: unknown) {
  return revisarUm(documentoId, 'pendente')
}

/**
 * Revisão em lote: cada documento com o seu resultado, nenhum silêncio.
 *
 * Documento já revisado e documento que o parser não leu não viram erro do
 * lote — entram no resumo, e o resto segue. Nada é revisado por engano: o
 * `check` de elegibilidade é o mesmo de um documento só.
 */
export async function revisarDocumentosFiscaisEmLote(
  documentoIds: unknown,
): Promise<RespostaRevisaoEmLote> {
  const sessao = await obterSessaoServidor()
  const selecao = SelecaoSchema.safeParse(documentoIds)
  const vazio = { selecionados: 0, revisados: 0, jaRevisados: 0, naoElegiveis: 0 }
  if (!sessao) {
    return { sucesso: false, mensagem: 'Sua sessão expirou. Entre novamente.', resumo: vazio }
  }
  if (!selecao.success) {
    return {
      sucesso: false,
      mensagem: `Selecione entre 1 e ${LIMITE_REVISAO_EM_LOTE} documentos.`,
      resumo: vazio,
    }
  }

  const ids = [...new Set(selecao.data)]
  const resumo = { selecionados: ids.length, revisados: 0, jaRevisados: 0, naoElegiveis: 0 }
  for (const id of ids) {
    const estado = await aplicarRevisaoNoDocumento(sessao.id, id, 'revisado')
    if (estado === 'alterado') resumo.revisados += 1
    else if (estado === 'ja_estava') resumo.jaRevisados += 1
    else resumo.naoElegiveis += 1
  }

  const partes = [`${resumo.revisados} revisados`]
  if (resumo.jaRevisados) partes.push(`${resumo.jaRevisados} já revisados`)
  if (resumo.naoElegiveis) partes.push(`${resumo.naoElegiveis} não elegíveis`)
  return {
    sucesso: resumo.revisados > 0,
    mensagem: `${resumo.selecionados} selecionados · ${partes.join(' · ')}.`,
    resumo,
  }
}
