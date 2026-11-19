import { headers } from 'next/headers'
import { conhecimentoDecisoes } from '@/db/schema'
import {
  registrarEventoAuditoria,
  type AcaoAuditoria,
  type EventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import type { AcaoEditorial } from '../constants/status'

import type { ExecutorDb } from '@/features/atendimentos/lib/executor'

type Executor = ExecutorDb

async function ipDaRequisicao(): Promise<string | null> {
  try {
    const encaminhado = (await headers()).get('x-forwarded-for')
    return encaminhado?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/**
 * Grava, na mesma transação da mudança:
 * - a linha do histórico editorial (exibida ao autor e à Gestão);
 * - o evento de auditoria da plataforma (com IP), quando houver ação auditável.
 */
export async function registrarDecisaoEditorial(
  executor: Executor,
  dados: {
    artigoId: string
    versaoId: string | null
    acao: AcaoEditorial
    executorId: string
    observacao?: string | null
    auditoria?: {
      acao: AcaoAuditoria
      origem: EventoAuditoria['origem']
      /** Autor do artigo — a conta afetada. */
      usuarioId?: string | null
      metadados?: Record<string, unknown>
    }
  },
) {
  await executor.insert(conhecimentoDecisoes).values({
    artigoId: dados.artigoId,
    versaoId: dados.versaoId,
    acao: dados.acao,
    executorId: dados.executorId,
    observacao: dados.observacao ?? null,
  })
  if (!dados.auditoria) return
  await registrarEventoAuditoria(
    {
      acao: dados.auditoria.acao,
      entidade: 'conhecimento_artigo',
      registroAfetado: dados.artigoId,
      autorId: dados.executorId,
      usuarioId: dados.auditoria.usuarioId ?? null,
      origem: dados.auditoria.origem,
      ip: await ipDaRequisicao(),
      metadados: { versaoId: dados.versaoId, ...(dados.auditoria.metadados ?? {}) },
    },
    executor,
  )
}

/** Evento de auditoria avulso (categoria, imagem). */
export async function registrarEventoConhecimento(evento: Omit<EventoAuditoria, 'ip'>) {
  try {
    await registrarEventoAuditoria({ ...evento, ip: await ipDaRequisicao() })
  } catch (erro) {
    console.error('[CONHECIMENTO_AUDITORIA_FALHOU]', { acao: evento.acao, erro })
  }
}
