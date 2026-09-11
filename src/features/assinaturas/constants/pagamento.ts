/**
 * O vocabulário do pagamento de uma assinatura da Vincis.
 *
 * ## Não é o pagamento simulado
 *
 * `features/pagamentos` simula o acordo de uma oportunidade e de uma consultoria
 * — linhas `origem = 'simulado'`, referência `SIM-…`, que nunca passaram por
 * dinheiro. Nada daqui lê ou escreve aquelas tabelas, e nada de lá prova
 * pagamento de assinatura. São fontes separadas de propósito.
 *
 * ## Estados
 *
 * - `pendente` — a cobrança existe e o dinheiro ainda não. Não produz efeito.
 * - `confirmado` — dinheiro confirmado por uma origem financeira válida. O
 *   único estado que cobre competências e ativa contrato.
 * - `cancelado` — a cobrança pendente morreu sem dinheiro.
 * - `estornado` — o dinheiro confirmado voltou. Deixa de cobrir, mas a linha e
 *   as alocações ficam como história.
 *
 * Não existe `pago`: "confirmado" diz de onde vem a verdade.
 */
export const STATUS_PAGAMENTO_ASSINATURA = [
  'pendente',
  'confirmado',
  'cancelado',
  'estornado',
] as const
export type StatusPagamentoAssinatura =
  (typeof STATUS_PAGAMENTO_ASSINATURA)[number]

/**
 * Quem pode confirmar dinheiro.
 *
 * Hoje só existe a confirmação manual de homologação, e o nome dela diz isso:
 * ninguém lendo o banco confunde `homologacao_manual` com gateway. O provedor
 * real entra aqui — e no `check` da tabela, por migration — no dia em que
 * existir, com a confirmação vinda de webhook validado.
 */
export const PROVEDOR_HOMOLOGACAO = 'homologacao_manual' as const
export const PROVEDORES_PAGAMENTO_ASSINATURA = [PROVEDOR_HOMOLOGACAO] as const
export type ProvedorPagamentoAssinatura =
  (typeof PROVEDORES_PAGAMENTO_ASSINATURA)[number]

export const MOEDA_ASSINATURA = 'BRL' as const
