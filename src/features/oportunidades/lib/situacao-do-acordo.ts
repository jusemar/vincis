/**
 * O que o prestador lê sobre o acordo fechado, na tela de Oportunidades.
 *
 * ## Pagamento aprovado × proposta aceita
 *
 * São fatos diferentes e a tela não pode confundi-los:
 *
 * - **Pagamento aprovado** só existe quando a Vincis recebeu e confirmou o
 *   dinheiro do acordo (serviço avulso pago pela Vincis) — há `pagoEm`.
 * - **Proposta aceita** sem pagamento intermediado: proposta `recorrente` do
 *   contador Autônomo e honorários de advogado. O cliente paga direto ao
 *   profissional, a Vincis não confirma nada, e o Atendimento abre no aceite.
 *
 * Por isso a decisão olha o pagamento registrado — nunca a mera existência do
 * Atendimento, que no fluxo direto nasce sem pagamento algum.
 */
export type SituacaoDoAcordo =
  | { tipo: 'pagamento_aprovado'; texto: string }
  | { tipo: 'proposta_aceita'; texto: string }
  | { tipo: 'aguardando_pagamento'; texto: string }

export function situacaoDoAcordoParaPrestador({
  pagoEm,
  natureza,
  protocolo,
}: {
  /** Quando a Vincis confirmou o pagamento do acordo. Nulo se não houve. */
  pagoEm: string | null
  /** `avulsa` | `recorrente`. */
  natureza: string
  /** Protocolo do Atendimento aberto (ex.: `#2026-0096`), quando existe. */
  protocolo: string | null
}): SituacaoDoAcordo {
  if (protocolo && pagoEm) {
    return { tipo: 'pagamento_aprovado', texto: `Pagamento aprovado · Atendimento ${protocolo} aberto.` }
  }
  if (protocolo) {
    return { tipo: 'proposta_aceita', texto: `Proposta aceita · Atendimento ${protocolo} aberto.` }
  }
  // Recorrente não passa por pagamento na Vincis: nunca "aguardando pagamento".
  if (natureza === 'recorrente') {
    return { tipo: 'proposta_aceita', texto: 'Proposta aceita · o Atendimento está sendo aberto.' }
  }
  return { tipo: 'aguardando_pagamento', texto: 'Aguardando o pagamento do Cliente para abrir o atendimento.' }
}
