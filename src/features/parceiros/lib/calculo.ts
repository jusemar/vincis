/**
 * Aritmética do Programa de Parceiros — pura, sem banco.
 *
 * Mora aqui para que o motor (comissão recorrente, comissão avulsa, nível) e o
 * simulador da página pública usem **a mesma conta**. Antes, o simulador
 * multiplicava em ponto flutuante por conta própria e podia divergir em
 * centavos do que o sistema registra. `registrar-comissao.ts` e `niveis.ts`
 * reexportam/consomem estas funções; nenhuma regra mudou de lugar no motor.
 */

/**
 * O valor da comissão, em centavos, a partir de um percentual inteiro (10 = 10%).
 *
 * Arredondamento meio-para-cima, uma vez só. É o cálculo da comissão avulsa.
 */
export function calcularComissaoCentavos(valorBaseCentavos: number, percentual: number): number {
  return Math.round((valorBaseCentavos * percentual) / 100)
}

/**
 * O valor da comissão a partir de um percentual em centésimos (500 = 5%).
 *
 * Só inteiros: `base × centésimos` cabe folgado num inteiro seguro, e o
 * arredondamento é meio-para-cima, feito uma vez. É o cálculo da recorrente,
 * cujo percentual vem da configuração da Gestão e pode ter duas casas.
 */
export function calcularComissaoPorCentesimos(valorBaseCentavos: number, percentualCentesimos: number): number {
  if (!Number.isInteger(valorBaseCentavos) || valorBaseCentavos < 0) {
    throw new Error('A base precisa ser um inteiro não negativo de centavos.')
  }
  if (!Number.isInteger(percentualCentesimos) || percentualCentesimos < 0) {
    throw new Error('O percentual precisa ser um inteiro não negativo de centésimos.')
  }
  return Math.floor((valorBaseCentavos * percentualCentesimos + 5_000) / 10_000)
}

/**
 * O maior nível cujo mínimo de clientes foi atingido.
 *
 * `niveis` vem da base para o topo, com a base exigindo zero — garantia de
 * `validarConfiguracaoDeNiveis`. Não considera proteção contra queda: isso é
 * histórico de cada parceiro, e quem precisa dele é `recalcularNivelDoParceiro`.
 */
export function nivelPorMinimoDeClientes<T extends { minimoClientes: number }>(niveis: readonly T[], clientes: number): T {
  let atingido = niveis[0]
  for (const nivel of niveis) {
    if (clientes >= nivel.minimoClientes) atingido = nivel
  }
  return atingido
}
