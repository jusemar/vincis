import type { cobrancasPix } from '@/db/schema'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'

/** A linha da cobrança, como o efeito a recebe — já travada e marcada paga. */
export type CobrancaPaga = typeof cobrancasPix.$inferSelect

/**
 * O que o pagamento produziu no domínio dono dele.
 *
 * - `aplicado`: o efeito existe (contratação, agendamento, acordo pago, mês
 *   coberto). `novo` distingue a primeira efetivação de uma repetição — só a
 *   primeira avisa e audita. `aposConfirmar` roda **depois** do commit: aviso
 *   de sino, tempo real e e-mail não podem acontecer para uma transação que
 *   ainda pode ser desfeita.
 * - `conflito`: o dinheiro entrou, mas o efeito deixou de ser possível. A
 *   cobrança fica paga e marcada para estorno manual; nada é inventado.
 */
export type ResultadoEfeito =
  | {
      efeito: 'aplicado'
      referenciaId: string
      atendimentoId: string | null
      protocolo: string | null
      novo: boolean
      aposConfirmar?: () => Promise<void>
    }
  | { efeito: 'conflito'; motivo: string }

/** Cada domínio implementa o seu; `lib/efeitos.ts` despacha pela finalidade. */
export type AplicarEfeito = (
  tx: TransacaoDb,
  cobranca: CobrancaPaga,
) => Promise<ResultadoEfeito>
