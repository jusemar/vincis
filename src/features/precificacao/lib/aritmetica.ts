/**
 * A aritmética de dinheiro do motor: inteira, exata e sem ponto flutuante.
 *
 * ## Por que um racional, e não um número com casas decimais
 *
 * O preço passa por até três multiplicadores em sequência (ramo, atendimento,
 * rotina) antes de ser arredondado. Arredondar entre eles mudaria o resultado;
 * usar `number` faria `1,07 × 1,14` chegar ao arredondamento com lixo na
 * décima quinta casa, e um valor que caísse exatamente no meio do múltiplo de
 * R$ 5 poderia cair para qualquer um dos lados dependendo desse lixo.
 *
 * Então o núcleo do cálculo é uma fração `numerador/denominador` em `bigint`:
 * cada multiplicador em milésimos multiplica o numerador e mil o denominador.
 * Nada é aproximado até o arredondamento final, que acontece uma vez só.
 *
 * ## O arredondamento é o mesmo de sempre
 *
 * Meio para cima — `Math.round` de JavaScript sobre valores positivos —, agora
 * feito em inteiros: `floor((2·num + den·passo) / (2·den·passo))`. Para o mesmo
 * valor exato, decide igual à implementação anterior; ao contrário dela, não
 * depende de como o número foi acumulado.
 */
export interface ValorExato {
  numerador: bigint
  denominador: bigint
}

export function exato(centavos: number | bigint): ValorExato {
  return { numerador: BigInt(centavos), denominador: 1n }
}

/** Multiplica por um fator em milésimos (1080 = 1,080×) sem perder exatidão. */
export function multiplicarPorMilesimos(
  valor: ValorExato,
  milesimos: number,
): ValorExato {
  return {
    numerador: valor.numerador * BigInt(milesimos),
    denominador: valor.denominador * 1000n,
  }
}

/** Soma um valor inteiro em centavos ao racional. */
export function somarCentavos(valor: ValorExato, centavos: number): ValorExato {
  return {
    numerador: valor.numerador + BigInt(centavos) * valor.denominador,
    denominador: valor.denominador,
  }
}

/**
 * Arredonda para o múltiplo de `passoCentavos` mais próximo, meio para cima.
 *
 * É a `round5` de antes, escrita em inteiros: com passo 500, R$ 69 vira R$ 70,
 * R$ 72 vira R$ 70 e R$ 73 vira R$ 75.
 */
export function arredondarParaMultiplo(
  valor: ValorExato,
  passoCentavos: number,
): number {
  const passo = BigInt(passoCentavos)
  const multiplos = dividirMeioParaCima(
    valor.numerador,
    valor.denominador * passo,
  )
  return Number(multiplos * passo)
}

/** Arredonda o racional para centavos inteiros. Só para exibir composição. */
export function arredondarParaCentavos(valor: ValorExato): number {
  return Number(dividirMeioParaCima(valor.numerador, valor.denominador))
}

/**
 * `round(a/b)` com empate para cima, em inteiros.
 *
 * Negativo nunca acontece no motor (não existe preço negativo), mas a conta
 * está escrita para o sinal certo em vez de supor o caso feliz.
 */
function dividirMeioParaCima(a: bigint, b: bigint): bigint {
  return dividirPiso(2n * a + b, 2n * b)
}

function dividirPiso(a: bigint, b: bigint): bigint {
  const quociente = a / b
  return a % b !== 0n && a < 0n !== b < 0n ? quociente - 1n : quociente
}
