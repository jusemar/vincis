import { PREFIXO_REFERENCIA_SIMULADA } from '../constants/pagamento'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Referência do pagamento simulado: `SIM-AAAA-XXXXXXXX`.
 *
 * Serve para o suporte e para a conciliação futura conseguirem falar de **um**
 * pagamento sem passar um UUID adiante. Os oito caracteres vêm de
 * `crypto.getRandomValues` e não de `Math.random`: a referência aparece em tela
 * e em e-mail, e um valor adivinhável convidaria a enumerar registros alheios.
 *
 * O alfabeto exclui `0/O` e `1/I` porque referência existe para ser lida em voz
 * alta e digitada de volta.
 *
 * Colisão é tratada pelo índice único da tabela, não por sorte: em 32^8 o
 * empate é improvável, mas "improvável" não é uma garantia — a garantia é o
 * banco recusar a segunda linha.
 */
export function gerarReferenciaSimulada(ano = new Date().getFullYear()) {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const sufixo = Array.from(
    bytes,
    (byte) => ALFABETO[byte % ALFABETO.length],
  ).join('')
  return `${PREFIXO_REFERENCIA_SIMULADA}-${ano}-${sufixo}`
}

/** O registro veio da simulação? Lê a coluna, não adivinha pelo formato. */
export function ehPagamentoSimulado(origem: string) {
  return origem === 'simulado'
}
