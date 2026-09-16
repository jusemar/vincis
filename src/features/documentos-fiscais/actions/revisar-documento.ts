'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { documentosFiscais } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import { resolverAcessoDocumentoFiscal } from '../lib/acesso-documentos-fiscais'
import { ENTIDADES_AUDITORIA_FISCAL, metadadosAuditoriaFiscal } from '../lib/auditoria'

/**
 * Revisão humana da leitura do documento (Fase 1.8).
 *
 * O que ela afirma é exatamente isto: **alguém autorizado conferiu os dados
 * extraídos deste XML**. Não valida a operação, não recalcula imposto e não diz
 * nada sobre a situação na SEFAZ — esses continuam sendo outros conceitos, em
 * outras colunas.
 *
 * Usa `status_revisao` e o par `revisado_em` / `revisado_por_id` que existem
 * desde a fundação, com o `check` do banco garantindo a coerência entre eles
 * (pendente ⇔ sem data). Nenhuma migration foi necessária.
 *
 * Exige `documentos_fiscais.revisar` **no documento** — a mesma porta do
 * reprocessamento. Documento de outro escritório, fora do escopo do membro ou
 * inexistente recebem a mesma resposta.
 */

const DocumentoIdSchema = z.string().uuid()

export type RespostaRevisao = {
  sucesso: boolean
  mensagem: string
  documentoId: string | null
  statusRevisao: 'pendente' | 'revisado' | null
}

const NAO_AUTORIZADO: RespostaRevisao = {
  sucesso: false,
  mensagem: 'Documento não encontrado ou sem autorização para revisar.',
  documentoId: null,
  statusRevisao: null,
}

async function alterarRevisao(
  documentoId: unknown,
  destino: 'revisado' | 'pendente',
): Promise<RespostaRevisao> {
  const sessao = await obterSessaoServidor()
  const id = DocumentoIdSchema.safeParse(documentoId)
  if (!sessao || !id.success) return NAO_AUTORIZADO

  const acesso = await resolverAcessoDocumentoFiscal(
    sessao.id,
    PERMISSOES_DOCUMENTOS_FISCAIS.revisar,
    id.data,
  )
  if (!acesso) return NAO_AUTORIZADO

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
        eq(documentosFiscais.id, id.data),
        eq(documentosFiscais.empresaId, acesso.empresaId),
        isNull(documentosFiscais.excluidoEm),
      ),
    )
    .limit(1)
  if (!documento) return NAO_AUTORIZADO

  // Revisar é conferir uma leitura: sem leitura, não há o que revisar.
  if (destino === 'revisado' && documento.statusProcessamento !== 'processado') {
    return {
      sucesso: false,
      mensagem: 'Este documento ainda não foi interpretado. Reprocesse antes de revisar.',
      documentoId: documento.id,
      statusRevisao: documento.statusRevisao as RespostaRevisao['statusRevisao'],
    }
  }
  if (documento.statusRevisao === destino) {
    return {
      sucesso: true,
      mensagem: destino === 'revisado' ? 'Documento já estava revisado.' : 'Revisão já estava pendente.',
      documentoId: documento.id,
      statusRevisao: destino,
    }
  }

  const agora = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(documentosFiscais)
      .set({
        statusRevisao: destino,
        // O `check` da tabela exige data quando não está pendente.
        revisadoEm: destino === 'revisado' ? agora : null,
        revisadoPorId: destino === 'revisado' ? sessao.id : null,
        updatedAt: agora,
      })
      .where(eq(documentosFiscais.id, documento.id))

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.documentoFiscalRevisado,
        entidade: ENTIDADES_AUDITORIA_FISCAL.documento,
        registroAfetado: documento.id,
        autorId: sessao.id,
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

  return {
    sucesso: true,
    mensagem: destino === 'revisado' ? 'Documento marcado como revisado.' : 'Revisão reaberta.',
    documentoId: documento.id,
    statusRevisao: destino,
  }
}

export async function marcarDocumentoFiscalRevisado(documentoId: unknown) {
  return alterarRevisao(documentoId, 'revisado')
}

/** Reabrir é o mesmo ato, ao contrário — e do mesmo perfil que revisa. */
export async function reabrirRevisaoDocumentoFiscal(documentoId: unknown) {
  return alterarRevisao(documentoId, 'pendente')
}
