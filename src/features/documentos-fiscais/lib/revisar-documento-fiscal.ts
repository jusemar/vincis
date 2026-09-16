import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { documentosFiscais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import { resolverAcessoDocumentoFiscal } from './acesso-documentos-fiscais'
import { ENTIDADES_AUDITORIA_FISCAL, metadadosAuditoriaFiscal } from './auditoria'

/**
 * Revisão humana da leitura de um documento — o núcleo usado tanto pela ação de
 * um documento quanto pela ação em lote.
 *
 * O que ela afirma continua sendo só isto: **alguém autorizado conferiu os
 * dados extraídos deste XML**. Não valida a operação, não recalcula imposto e
 * não diz nada sobre a situação na SEFAZ.
 *
 * Cada documento é autorizado individualmente (`documentos_fiscais.revisar` no
 * próprio documento): num lote, a lista que chega do navegador é uma sugestão,
 * nunca uma permissão. Documento de outro escritório ou fora do escopo do
 * membro é tratado como não elegível — a resposta não distingue os dois casos,
 * para não revelar que ele existe.
 */

export type EstadoRevisao = 'alterado' | 'ja_estava' | 'nao_interpretado' | 'sem_acesso'

export async function aplicarRevisaoNoDocumento(
  usuarioId: string,
  documentoId: string,
  destino: 'revisado' | 'pendente',
): Promise<EstadoRevisao> {
  const acesso = await resolverAcessoDocumentoFiscal(
    usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.revisar,
    documentoId,
  )
  if (!acesso) return 'sem_acesso'

  const [documento] = await db
    .select({
      id: documentosFiscais.id,
      clienteId: documentosFiscais.clienteId,
      statusRevisao: documentosFiscais.statusRevisao,
      statusProcessamento: documentosFiscais.statusProcessamento,
    })
    .from(documentosFiscais)
    .where(
      and(
        eq(documentosFiscais.id, documentoId),
        eq(documentosFiscais.empresaId, acesso.empresaId),
        isNull(documentosFiscais.excluidoEm),
      ),
    )
    .limit(1)
  if (!documento) return 'sem_acesso'

  // Revisar é conferir uma leitura: sem leitura, não há o que revisar.
  if (destino === 'revisado' && documento.statusProcessamento !== 'processado') {
    return 'nao_interpretado'
  }
  if (documento.statusRevisao === destino) return 'ja_estava'

  const agora = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(documentosFiscais)
      .set({
        statusRevisao: destino,
        // O `check` da tabela exige data quando não está pendente.
        revisadoEm: destino === 'revisado' ? agora : null,
        revisadoPorId: destino === 'revisado' ? usuarioId : null,
        updatedAt: agora,
      })
      .where(eq(documentosFiscais.id, documento.id))

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.documentoFiscalRevisado,
        entidade: ENTIDADES_AUDITORIA_FISCAL.documento,
        registroAfetado: documento.id,
        autorId: usuarioId,
        empresaId: acesso.empresaId,
        origem: 'admin',
        metadados: metadadosAuditoriaFiscal({
          clienteId: documento.clienteId,
          statusAnterior: documento.statusRevisao,
          statusNovo: destino,
        }),
      },
      tx,
    )
  })

  return 'alterado'
}
