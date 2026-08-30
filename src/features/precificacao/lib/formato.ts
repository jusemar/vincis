/**
 * Centavos viram texto só aqui, na borda.
 *
 * O motor devolve inteiros e o domínio inteiro trabalha com eles; a conversão
 * para real acontece no último passo, na tela. É o que impede um valor
 * formatado de voltar para dentro de uma conta.
 *
 * O formato é o mesmo que a página já exibia: sem centavos, porque todo preço
 * sai arredondado para múltiplo de R$ 5.
 */
export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

/** Centavos em reais inteiros, para quem anima o número na tela. */
export function reaisDeCentavos(centavos: number): number {
  return centavos / 100
}
