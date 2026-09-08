/**
 * O que a tela financeira mostra e o backend ainda não produz.
 *
 * **Simulação.** Nada aqui vem do banco e nada aqui entra em cálculo real: os
 * totais, o saldo e a lista de comissões da página saem de `parceiro_comissoes`
 * e não passam por este arquivo. Ele existe só para que os blocos de saque
 * — que dependem de pagamento ao parceiro, e pagamento não existe nesta fatia —
 * apareçam com forma e conteúdo plausíveis enquanto são construídos.
 *
 * Apagar este arquivo e os três blocos que o importam remove a parte simulada
 * da tela sem tocar em uma linha de dado real. É esse o critério: se algo daqui
 * precisasse ser somado a um valor verdadeiro, estaria no lugar errado.
 */

/** Saques já concluídos. Não existe tabela de saque — nem deve existir ainda. */
export const SAQUES_SIMULADOS = [
  { id: 'SQ-00219', data: '2026-08-29', valorCentavos: 116000, metodo: 'PIX · ****4821', status: 'Pago' },
  { id: 'SQ-00204', data: '2026-07-30', valorCentavos: 94000, metodo: 'PIX · ****4821', status: 'Pago' },
  { id: 'SQ-00198', data: '2026-07-02', valorCentavos: 72500, metodo: 'PIX · ****4821', status: 'Pago' },
] as const

/** Método de recebimento. Nenhum dado bancário real é guardado hoje. */
export const RECEBIMENTO_SIMULADO = {
  descricao: 'PIX · CPF ****4821',
  titular: 'Titular da conta',
} as const

/** Prazo anunciado no card de saque. Regra comercial, ainda sem processo. */
export const PRAZO_PAGAMENTO_SIMULADO = 'Pagamentos processados em até 3 dias úteis.'
