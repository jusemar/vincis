/**
 * Dinheiro do livro de repasses, sempre com centavos.
 *
 * Não reaproveita `formatarCentavos` da Precificação de propósito: aquele
 * formato arredonda para reais inteiros (preço de vitrine é múltiplo de R$ 5),
 * e aqui um Pix de R$ 1,00 dividido em 25/75 viraria "R$ 0" para a Vincis e
 * "R$ 1" para o profissional. Valor devido e comprovante de repasse precisam
 * bater com o extrato, centavo a centavo.
 */
const FORMATO_EXATO = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatarValorRepasse(centavos: number): string {
  return FORMATO_EXATO.format(centavos / 100)
}
