/**
 * Vocabulário do pagamento de um acordo de oportunidade.
 *
 * ## Leia isto antes de mexer
 *
 * **Nada aqui cobra dinheiro.** Esta etapa existe para fechar o fluxo
 * funcional — acordo → pagamento → Atendimento — enquanto a integração real
 * não existe. Toda linha gravada nasce com `origem = 'simulado'` e uma
 * referência `SIM-…`, e as duas coisas são deliberadas: no dia em que houver
 * gateway, distinguir o que foi teste do que foi dinheiro precisa ser uma
 * leitura de coluna, não uma arqueologia de datas.
 *
 * O simulador **não** coleta cartão, CVV, titular, bandeira, CPF do pagador nem
 * chave PIX, e a tabela não tem colunas para nada disso. Não é uma tela de
 * pagamento com os campos desabilitados: é a ausência da coleta.
 */

/** Origem do pagamento. Hoje só existe uma, e ela se identifica. */
export const ORIGEM_SIMULADA = 'simulado' as const

/** Estados possíveis. `aprovado` é o único que esta etapa alcança. */
export const STATUS_PAGAMENTO = ['aprovado'] as const
export type StatusPagamento = (typeof STATUS_PAGAMENTO)[number]

/**
 * Prefixo da referência.
 *
 * Escolhido para **não** parecer identificador de gateway nenhum: `pi_…`,
 * `ch_…`, `pay_…` e `E…` já são formatos reais de provedores conhecidos, e
 * imitá-los faria um registro de teste passar por transação verdadeira num
 * relatório futuro.
 */
export const PREFIXO_REFERENCIA_SIMULADA = 'SIM'

/** Rótulo único da etapa na interface. Nunca "Pagamento" sem qualificação. */
export const ROTULO_PAGAMENTO_SIMULADO = 'Simulação de pagamento'
