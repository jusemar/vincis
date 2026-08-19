/**
 * Dinheiro da negociação, em centavos.
 *
 * Centavos inteiros de ponta a ponta — no banco, na action e na tela. Valor em
 * reais como número decimal acumularia erro de ponto flutuante justamente no
 * campo que vira acordo entre duas pessoas.
 */

/** `123456` → `R$ 1.234,56`. Nulo vira o texto de ausência, não `R$ 0,00`. */
export function rotuloValorCentavos(
  centavos: number | null,
  ausente = 'Sem valor definido',
) {
  if (centavos === null) return ausente
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * O que a pessoa digitou → centavos.
 *
 * Aceita as formas que aparecem de verdade num campo livre: `1.234,56`,
 * `1234,56`, `1234.56` e `1234`. Campo vazio devolve `null` — ausência de valor
 * é um caso legítimo, e não zero.
 *
 * O ponto só é tratado como separador decimal quando não há vírgula: em
 * `1.234,56` ele é milhar, em `1234.56` é decimal. Confundir os dois
 * transformaria mil e duzentos reais em um real e vinte e três.
 */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.trim()
  if (!limpo) return null

  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const numero = Number(normalizado.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(numero)) return null

  return Math.round(numero * 100)
}
