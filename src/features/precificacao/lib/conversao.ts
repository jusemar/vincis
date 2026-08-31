/**
 * As unidades do Gestor e as unidades do banco.
 *
 * Quem administra preço pensa em reais e em porcentagem; o banco guarda
 * centavos e milésimos. A tradução mora aqui, nas duas direções, e em lugar
 * nenhum mais — obrigar o Gestor a digitar `19500` para dizer R$ 195,00, ou
 * `1350` para dizer "35% a mais", seria expor a implementação como se fosse a
 * regra de negócio.
 *
 * ## Multiplicador e desconto não são a mesma porcentagem
 *
 * Um **acréscimo** é guardado como fator: 1350 quer dizer 1,350× — 35% a mais
 * do que a base. Um **desconto** é guardado como fração: 150 quer dizer 0,150 —
 * 15% a menos. Os dois aparecem na tela como "35%" e "15%", e é justamente por
 * parecerem iguais na tela que a conversão de cada um precisa ter nome próprio.
 */

/** R$ 195,00 → 19500. Arredonda porque `1.15 * 100` não é 115 em float. */
export function reaisParaCentavos(reais: number): number {
  return Math.round(reais * 100)
}

/** 19500 → 195. Valor pronto para um campo em reais. */
export function centavosParaReais(centavos: number): number {
  return centavos / 100
}

/** 1350 → 35 (por cento a mais). Fator neutro (1000) vira 0. */
export function acrescimoPercentual(multiplicadorMilesimos: number): number {
  return (multiplicadorMilesimos - 1000) / 10
}

/** 35 → 1350. Meio décimo de ponto percentual é a menor variação aceita. */
export function percentualParaMultiplicador(percentual: number): number {
  return 1000 + Math.round(percentual * 10)
}

/** 150 → 15 (por cento de desconto). */
export function descontoPercentual(descontoMilesimos: number): number {
  return descontoMilesimos / 10
}

/** 15 → 150. */
export function percentualParaDesconto(percentual: number): number {
  return Math.round(percentual * 10)
}

/**
 * O mesmo fator, dito como a tela do Gestor diz: 1080 → "1,080".
 *
 * Acréscimo e multiplicador são duas leituras do mesmo número — "8% a mais" e
 * "1,08×". A tela de administração usa a segunda porque é assim que se compara
 * um ramo com outro de relance; as Server Actions continuam recebendo a
 * primeira, e a conversão entre elas mora aqui.
 */
export function multiplicadorDeMilesimos(milesimos: number): number {
  return milesimos / 1000
}

/** "1,08" → 8 (por cento a mais), que é o que a Server Action espera. */
export function multiplicadorParaPercentual(multiplicador: number): number {
  return Math.round((multiplicador - 1) * 1000) / 10
}
