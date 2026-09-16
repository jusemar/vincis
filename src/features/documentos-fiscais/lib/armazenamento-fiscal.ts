import { del, get, put } from '@vercel/blob'

/**
 * Armazenamento privado dos originais fiscais.
 *
 * O mesmo Vercel Blob privado dos anexos de Atendimento e dos comprovantes
 * profissionais (`@/lib/anexos-privados`): nada de segundo storage. O que muda é
 * a política, que aqui é mais estrita:
 *
 * - `access: 'private'` — sem URL pública; o conteúdo só sai pela rota de
 *   download autorizada;
 * - `allowOverwrite: false` explícito — gravar de novo na mesma chave falha no
 *   próprio storage. Com a chave feita de ids sorteados, conteúdo diferente
 *   nunca reaproveita um caminho, e um original aceito não é trocado;
 * - `contentType` fixo — nunca o MIME declarado pelo navegador.
 *
 * A chave carrega só identificadores (`documentos-fiscais/<empresa>/<documento>/
 * <arquivo>.xml`): nome original, chave de acesso e CNPJ não entram no caminho.
 */

export function montarChaveOriginal(empresaId: string, documentoId: string, arquivoId: string) {
  return `documentos-fiscais/${empresaId}/${documentoId}/${arquivoId}.xml`
}

export async function gravarOriginalPrivado(chave: string, bytes: Uint8Array, contentType: string) {
  // Cópia em ArrayBuffer próprio: o `put` aceita BodyInit, e um Uint8Array que
  // é visão de um buffer maior mandaria bytes a mais.
  const corpo = bytes.slice().buffer
  const blob = await put(chave, corpo, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
  })
  return { chave: blob.pathname }
}

export async function lerOriginalPrivado(chave: string) {
  const resultado = await get(chave, { access: 'private', useCache: false })
  if (!resultado || resultado.statusCode !== 200) return null
  return { stream: resultado.stream }
}

/**
 * Compensação: remove um objeto gravado cujo registro no banco **não** chegou a
 * ser confirmado (falha ou duplicidade descoberta na transação).
 *
 * Nunca é chamada para original aceito — o fluxo de recebimento é o único que a
 * usa, e só antes do commit.
 */
export async function descartarObjetoNaoRegistrado(chave: string) {
  await del(chave)
}
