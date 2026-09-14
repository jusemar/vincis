import { and, eq, isNull, sql } from 'drizzle-orm'
import type { db as Banco } from '@/db/connection'
import { parceiroSaqueItens, parceiroSaques } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'

type Transacao = Parameters<Parameters<typeof Banco.transaction>[0]>[0]

export type ResultadoDaRetirada =
  | 'sem_reserva'
  | 'saque_nao_solicitado'
  | 'saque_ajustado'
  | 'saque_cancelado'

/**
 * Tira de um saque solicitado o dinheiro que deixou de valer.
 *
 * Serve a comissão recorrente estornada e a bônus de campanha invalidado — a
 * mesma regra, num lugar só:
 *
 * - sem reserva ativa → nada a fazer;
 * - saque que não está `solicitado` (pago, recusado) → nada muda aqui;
 * - senão, o item sai da reserva (fica na tabela, com `liberado_em`) e o saque
 *   passa a valer o que sobrou. Se não sobrar nada, o saque é `cancelado` com o
 *   motivo em `observacao` — nunca um pedido de R$ 0,00.
 *
 * Trava o saque (`for update`); quem chama já travou a origem. Idempotente:
 * condicionado ao estado atual.
 */
export async function retirarDaReservaDeSaque(
  tx: Transacao,
  origem: { comissaoId: string } | { bonusId: string },
  {
    valorCentavos,
    observacaoSeEsvaziar,
    metadados,
  }: {
    valorCentavos: number
    observacaoSeEsvaziar: string
    metadados: Record<string, unknown>
  },
): Promise<ResultadoDaRetirada> {
  const agora = new Date()
  const [reserva] = await tx
    .select({ itemId: parceiroSaqueItens.id, saqueId: parceiroSaqueItens.saqueId })
    .from(parceiroSaqueItens)
    .where(
      and(
        'comissaoId' in origem
          ? eq(parceiroSaqueItens.comissaoId, origem.comissaoId)
          : eq(parceiroSaqueItens.bonusId, origem.bonusId),
        isNull(parceiroSaqueItens.liberadoEm),
      ),
    )
    .limit(1)
  if (!reserva) return 'sem_reserva'

  const [saque] = await tx
    .select({ id: parceiroSaques.id, status: parceiroSaques.status })
    .from(parceiroSaques)
    .where(eq(parceiroSaques.id, reserva.saqueId))
    .limit(1)
    .for('update')
  if (saque?.status !== 'solicitado') return 'saque_nao_solicitado'

  await tx
    .update(parceiroSaqueItens)
    .set({ liberadoEm: agora })
    .where(eq(parceiroSaqueItens.id, reserva.itemId))

  const [restante] = await tx
    .select({
      total: sql<number>`coalesce(sum(${parceiroSaqueItens.valorCentavos}), 0)`.mapWith(Number),
    })
    .from(parceiroSaqueItens)
    .where(and(eq(parceiroSaqueItens.saqueId, saque.id), isNull(parceiroSaqueItens.liberadoEm)))

  if (restante.total > 0) {
    await tx
      .update(parceiroSaques)
      .set({ valorCentavos: restante.total, updatedAt: agora })
      .where(eq(parceiroSaques.id, saque.id))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.saqueParceiroAjustadoPorEstorno,
        entidade: 'parceiro_saques',
        registroAfetado: saque.id,
        origem: 'sistema',
        metadados: {
          ...metadados,
          valorRetiradoCentavos: valorCentavos,
          novoValorCentavos: restante.total,
        },
      },
      tx,
    )
    return 'saque_ajustado'
  }

  // O valor fica como estava: é o retrato do que foi pedido, e o `check` do
  // saque não admite zero. O status diz que acabou.
  await tx
    .update(parceiroSaques)
    .set({
      status: 'cancelado',
      canceladoEm: agora,
      observacao: observacaoSeEsvaziar,
      updatedAt: agora,
    })
    .where(eq(parceiroSaques.id, saque.id))
  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.saqueParceiroCanceladoPorEstorno,
      entidade: 'parceiro_saques',
      registroAfetado: saque.id,
      origem: 'sistema',
      metadados: { ...metadados, valorRetiradoCentavos: valorCentavos },
    },
    tx,
  )
  return 'saque_cancelado'
}
