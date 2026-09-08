/**
 * O que a tela financeira mostra e o backend ainda não produz.
 *
 * **Simulação.** Nada aqui vem do banco e nada aqui entra em cálculo real: os
 * totais, o saldo e a lista de comissões da página saem de `parceiro_comissoes`
 * e não passam por este arquivo. Ele existe só para que os blocos de saque
 * — que dependem de pagamento ao parceiro, e pagamento não existe nesta fatia —
 * apareçam com forma e conteúdo plausíveis enquanto são construídos.
 *
 * O histórico de saques saiu daqui quando a solicitação virou real: ele agora
 * vem de `parceiro_saques`. O que resta é o método de recebimento, e ele
 * continua simulado de propósito — a plataforma não guarda dado bancário em
 * lugar nenhum, e inventar esse armazenamento só para completar o visual seria
 * o pior tipo de atalho.
 *
 * Apagar este arquivo e o bloco que o importa remove a parte simulada da tela
 * sem tocar em uma linha de dado real. É esse o critério: se algo daqui
 * precisasse ser somado a um valor verdadeiro, estaria no lugar errado.
 */

/** Método de recebimento. Nenhum dado bancário real é guardado hoje. */
export const RECEBIMENTO_SIMULADO = {
  descricao: 'PIX · CPF ****4821',
  titular: 'Titular da conta',
} as const

/** Prazo anunciado no card de saque. Regra comercial, ainda sem processo. */
export const PRAZO_PAGAMENTO_SIMULADO = 'Pagamentos processados em até 3 dias úteis.'
