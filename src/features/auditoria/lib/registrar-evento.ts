import type { PgTransaction } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import { eventosAuditoria } from '@/db/schema'

/**
 * Ações auditadas da plataforma. Lista fechada para que o nome do evento não
 * varie entre chamadas e as consultas de auditoria continuem confiáveis.
 */
export const ACOES_AUDITORIA = {
  contaVerificadaViaWhatsappGestao: 'conta_verificada_via_whatsapp_gestao',
  atendimentoCriado: 'atendimento_criado',
  arquivoAnexadoAoAtendimento: 'arquivo_anexado_ao_atendimento',
  atendimentoConcluido: 'atendimento_concluido',
  atendimentoAvaliado: 'atendimento_avaliado',
  ajusteSolicitado: 'ajuste_solicitado',
  ajusteAnalisado: 'ajuste_analisado',
  atendimentoReaberto: 'atendimento_reaberto',
} as const

export type AcaoAuditoria =
  (typeof ACOES_AUDITORIA)[keyof typeof ACOES_AUDITORIA]

type Executor = Pick<typeof db, 'insert'>

export type EventoAuditoria = {
  acao: AcaoAuditoria
  entidade: string
  registroAfetado?: string | null
  /** Quem executou a ação. */
  autorId?: string | null
  /** Conta afetada pela ação. */
  usuarioId?: string | null
  empresaId?: string | null
  origem: 'gestao_vincis' | 'admin' | 'sistema'
  ip?: string | null
  /** Só o mínimo estruturado da decisão. Nunca conteúdo de conversa. */
  metadados?: Record<string, unknown> | null
}

/**
 * Grava um evento de auditoria.
 *
 * Aceita uma transação para que o registro caia junto com a alteração que ele
 * documenta: auditar um fato que não chegou a ser gravado seria pior do que não
 * auditar.
 */
export async function registrarEventoAuditoria(
  evento: EventoAuditoria,
  executor: Executor | PgTransaction<never, never, never> = db,
) {
  const [registro] = await (executor as Executor)
    .insert(eventosAuditoria)
    .values({
      acao: evento.acao,
      entidade: evento.entidade,
      registroAfetado: evento.registroAfetado ?? null,
      autorId: evento.autorId ?? null,
      usuarioId: evento.usuarioId ?? null,
      empresaId: evento.empresaId ?? null,
      origem: evento.origem,
      ip: evento.ip ?? null,
      metadados: evento.metadados ?? null,
    })
    .returning({ id: eventosAuditoria.id })

  return registro
}
