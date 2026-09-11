/**
 * Reparte um valor em partes inteiras de centavos, sem criar nem perder um só.
 *
 * ## Por que não `total / partes`
 *
 * R$ 1.000,00 em três meses é R$ 333,333… — e centavo não se fraciona. Arredondar
 * cada parte para cima cria dinheiro; para baixo, some com ele. Aqui cada parte
 * recebe o quociente inteiro e o resto é distribuído um centavo por vez nas
 * **primeiras** partes: 1000 / 3 vira 334 + 333 + 333. A soma é sempre
 * exatamente o total.
 *
 * ## Determinístico
 *
 * O mesmo total em as mesmas partes produz sempre a mesma lista, na mesma ordem.
 * É o que permite regenerar competências de um contrato e obter os mesmos
 * valores, e o que faz um teste poder afirmar qual mês leva o centavo a mais.
 */
export function distribuirCentavos(total: number, partes: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('O total precisa ser um inteiro não negativo de centavos.')
  }
  if (!Number.isInteger(partes) || partes < 1) {
    throw new Error('Precisa haver ao menos uma parte.')
  }

  const base = Math.floor(total / partes)
  const resto = total - base * partes
  return Array.from({ length: partes }, (_, indice) =>
    indice < resto ? base + 1 : base,
  )
}
