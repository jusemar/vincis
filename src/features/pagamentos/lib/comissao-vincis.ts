import { db } from '@/db/connection'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { calcularComissaoVincis } from '@/features/servicos/constants/comissao'
import { lerComissaoServicosAvulsos } from '@/features/servicos/queries/comissao-vincis'
import type { FinalidadeCobranca } from '../constants/cobranca'

/**
 * Comissão da Vincis em todo serviço **avulso** pago pela plataforma.
 *
 * Regra aprovada: serviço avulso + pagamento pela Vincis = comissão Vincis
 * obrigatória. Vale para as três portas de serviço pontual que passam pelo
 * Pix — serviço de preço fixo do catálogo, acordo de proposta/orçamento e
 * consultoria avulsa. O plano recorrente (`assinatura`) é outra regra: o valor
 * apresentado ao cliente já contempla a estrutura da Vincis.
 *
 * O percentual é sempre o da configuração da Gestão
 * (`servicos_avulsos.comissao_vincis_milesimos`), sem padrão no código. Não tem
 * relação com a comissão do parceiro indicador.
 */
export const FINALIDADES_AVULSAS: readonly FinalidadeCobranca[] = ['servico', 'acordo', 'consultoria']

export function finalidadeAvulsa(finalidade: string): boolean {
  return (FINALIDADES_AVULSAS as readonly string[]).includes(finalidade)
}

/** A divisão congelada no Pix e copiada para o registro do pagamento. */
export type RetratoComissaoVincis = {
  milesimos: number
  comissaoCentavos: number
  profissionalCentavos: number
}

/**
 * A divisão do valor com o percentual vigente agora, ou `null` quando a Gestão
 * ainda não configurou — e então o Pix do avulso **não** é emitido.
 */
export async function retratoComissaoVigente(
  valorCentavos: number,
  executor: ExecutorDb = db,
): Promise<RetratoComissaoVincis | null> {
  const milesimos = await lerComissaoServicosAvulsos(executor)
  return milesimos === null ? null : calcularComissaoVincis(valorCentavos, milesimos)
}

/** O retrato que viajou no `contexto` da cobrança, se for um retrato válido. */
export function retratoDoContexto(contexto: unknown): RetratoComissaoVincis | null {
  if (!contexto || typeof contexto !== 'object') return null
  const retrato = (contexto as { comissaoVincis?: unknown }).comissaoVincis
  if (!retrato || typeof retrato !== 'object') return null
  const { milesimos, comissaoCentavos, profissionalCentavos } = retrato as Record<string, unknown>
  if (![milesimos, comissaoCentavos, profissionalCentavos].every((n) => Number.isInteger(n))) return null
  return {
    milesimos: milesimos as number,
    comissaoCentavos: comissaoCentavos as number,
    profissionalCentavos: profissionalCentavos as number,
  }
}

/**
 * As três colunas do retrato, prontas para o `insert` do pagamento.
 *
 * Só quando as partes fecham com o valor efetivamente pago; cobrança antiga
 * (sem retrato) fica sem — nunca recalculada com o percentual de hoje.
 */
export function colunasDoRetrato(retrato: RetratoComissaoVincis | null | undefined, valorCentavos: number) {
  if (!retrato || retrato.comissaoCentavos + retrato.profissionalCentavos !== valorCentavos) return {}
  return {
    comissaoVincisMilesimos: retrato.milesimos,
    comissaoVincisCentavos: retrato.comissaoCentavos,
    valorProfissionalCentavos: retrato.profissionalCentavos,
  }
}
