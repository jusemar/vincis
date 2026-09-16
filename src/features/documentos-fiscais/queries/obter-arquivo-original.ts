import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { documentosFiscais, documentosFiscaisArquivos } from '@/db/schema'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import { resolverAcessoDocumentoFiscal } from '../lib/acesso-documentos-fiscais'

/**
 * Arquivo original que o usuário pode baixar, ou `null`.
 *
 * A autorização vem da linha do documento (`documentos_fiscais.baixar` +
 * vínculo + acesso ao cliente), e o arquivo precisa ser daquele documento e
 * daquela empresa. Inexistente, de outro escritório, de outro documento ou sem
 * permissão: todos respondem `null`, sem distinguir.
 *
 * Documento excluído logicamente não é servido por esta rota.
 */
export async function obterArquivoOriginalParaDownload(entrada: {
  usuarioId: string
  documentoId: string
  arquivoId: string
}) {
  const acesso = await resolverAcessoDocumentoFiscal(
    entrada.usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.baixar,
    entrada.documentoId,
  )
  if (!acesso) return null

  const [arquivo] = await db
    .select({
      id: documentosFiscaisArquivos.id,
      nomeOriginal: documentosFiscaisArquivos.nomeOriginal,
      tipoMime: documentosFiscaisArquivos.tipoMime,
      chave: documentosFiscaisArquivos.chaveArmazenamento,
      clienteId: documentosFiscais.clienteId,
    })
    .from(documentosFiscaisArquivos)
    .innerJoin(documentosFiscais, eq(documentosFiscais.id, documentosFiscaisArquivos.documentoFiscalId))
    .where(
      and(
        eq(documentosFiscaisArquivos.id, entrada.arquivoId),
        eq(documentosFiscaisArquivos.documentoFiscalId, entrada.documentoId),
        eq(documentosFiscaisArquivos.empresaId, acesso.empresaId),
        isNull(documentosFiscais.excluidoEm),
      ),
    )
    .limit(1)

  return arquivo ? { ...arquivo, empresaId: acesso.empresaId } : null
}
