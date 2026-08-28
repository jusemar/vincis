import { ORIGEM_SIMULADA } from '../constants/pagamento'
import { gerarReferenciaSimulada } from './referencia-simulada'

/**
 * O motor do pagamento simulado, sem saber o que está sendo pago.
 *
 * ## Por que existe
 *
 * Dois fluxos precisam simular cobrança: o acordo de uma oportunidade, que já
 * existia, e a Consultoria Agendada. O que eles têm em comum é pequeno e
 * inteiro — decidir o desfecho, marcar a origem, gerar a referência — e o que
 * têm de diferente é tudo o resto: quem pode pagar, o que a aprovação produz,
 * qual índice único garante a idempotência. Extrair essa parte pequena evita a
 * alternativa ruim, que seria a consultoria forjar uma oportunidade vazia só
 * para caber no motor existente.
 *
 * Esta camada **não** grava nada, não conhece tabela e não conhece sessão. Ela
 * responde uma pergunta e devolve um resultado; quem persiste é cada fluxo, na
 * sua própria transação e com as suas próprias travas.
 *
 * ## Nada aqui cobra dinheiro
 *
 * Não há gateway, não há cartão, não há CVV, titular, bandeira nem chave PIX —
 * e não é uma tela com campos desabilitados: é a ausência da coleta. Toda saída
 * nasce marcada com `origem = 'simulado'` e referência `SIM-…` para que, no dia
 * em que houver cobrança real, distinguir teste de dinheiro seja leitura de
 * coluna e não arqueologia de datas.
 *
 * ## O desfecho pode ser pedido de fora
 *
 * `desfecho` existe para exercitar a recusa — sem ele não haveria como testar
 * "pagamento falhou" num simulador que sempre aprova. Deixar isso na mão de
 * quem chama não abre brecha: aprovar já é o comportamento padrão, então o
 * único poder que o parâmetro concede é o de **falhar**. Ninguém consegue
 * comprar nada pedindo para ser recusado.
 */

export const DESFECHOS_SIMULACAO = ['aprovado', 'recusado'] as const
export type DesfechoSimulacao = (typeof DESFECHOS_SIMULACAO)[number]

export type ResultadoSimulacao =
  | {
      aprovado: true
      status: 'aprovado'
      origem: typeof ORIGEM_SIMULADA
      referencia: string
      valorCentavos: number
    }
  | {
      aprovado: false
      motivo: string
    }

/** O texto que o Cliente lê quando a simulação recusa. */
export const MENSAGEM_PAGAMENTO_RECUSADO =
  'O pagamento não foi aprovado. Você pode tentar novamente.'

export function processarPagamentoSimulado({
  valorCentavos,
  desfecho = 'aprovado',
  ano,
}: {
  /** Sempre o valor que o **servidor** apurou. Nunca o que a tela mostrou. */
  valorCentavos: number
  desfecho?: DesfechoSimulacao
  ano?: number
}): ResultadoSimulacao {
  // Um pagamento de zero não é um pagamento. A checagem fica aqui, e não só no
  // `check` da tabela, para que a recusa chegue como mensagem em vez de erro.
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    return { aprovado: false, motivo: 'Valor inválido para cobrança.' }
  }

  if (desfecho === 'recusado') {
    return { aprovado: false, motivo: MENSAGEM_PAGAMENTO_RECUSADO }
  }

  return {
    aprovado: true,
    status: 'aprovado',
    origem: ORIGEM_SIMULADA,
    referencia: gerarReferenciaSimulada(ano),
    valorCentavos,
  }
}
