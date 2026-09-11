/**
 * Vocabulário do Programa de Parceiros.
 *
 * ## Níveis não moram aqui
 *
 * Bronze, Prata e Ouro — percentual, mínimo de clientes e dias de proteção —
 * são configuração da Gestão, versionada no banco (`lib/niveis.ts`). Nenhum
 * desses números existe no código: a tela, o motor e a comissão leem a versão
 * publicada. Este arquivo guarda o que é regra fixa (a comissão avulsa) e os
 * formatadores de percentual.
 */


/** Percentual formatado no padrão brasileiro: `7,5%`. */
export function percentualFormatado(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}


/** Comissão fixa dos serviços avulsos. Não depende de nível. */
export const PERCENTUAL_AVULSO = 10

/**
 * O potencial de comissão de um negócio avulso, em centavos.
 *
 * Estimativa, e só isso: nada aqui é lançamento, saldo ou obrigação. Existe
 * para o parceiro entender o tamanho do negócio que trouxe, e o rótulo na tela
 * é quem diz que é estimativa.
 *
 * Usa `PERCENTUAL_AVULSO` justamente porque avulso **não depende de nível**: o
 * nível ainda não tem persistência, e derivar dinheiro do nível mockado seria
 * transformar um dado de vitrine em número financeiro. O bônus adicional ainda
 * não está definido e por isso não entra na conta.
 *
 * Sem valor congelado — o caso do `sob_orcamento` — não há estimativa: devolve
 * nulo, e a tela mostra o negócio sem inventar um número.
 */
export function estimarComissaoAvulsoCentavos(
  valorCentavos: number | null,
): number | null {
  if (valorCentavos === null || valorCentavos <= 0) return null
  return Math.round((valorCentavos * PERCENTUAL_AVULSO) / 100)
}

/**
 * A natureza do negócio, a partir do modelo de preço congelado.
 *
 * Hoje todos os modelos do catálogo (`fixo`, `a_partir_de`, `por_hora`,
 * `sob_orcamento`) são cobranças de uma vez — **recorrência ainda não existe no
 * catálogo**, não é um dado que o sistema deixou de gravar. Por isso a resposta
 * é sempre `avulso`, e é aqui que ela mudará quando um modelo recorrente
 * nascer, em vez de espalhar a dedução pela interface.
 */
export function tipoDoNegocio(
  modeloPreco: string | null,
): 'avulso' | 'recorrente' | null {
  return modeloPreco ? 'avulso' : null
}

/**
 * Um percentual guardado em centésimos (500 = 5%) como a tela o mostra: `7,5%`.
 *
 * É assim que a configuração de níveis guarda percentuais — inteiros, para que
 * a comissão nunca passe por ponto flutuante. A divisão aqui é só de exibição.
 */
export function formatarPercentualCentesimos(centesimos: number): string {
  return `${(centesimos / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/** Os mesmos centésimos como texto decimal exato, para a coluna `numeric`: `7.50`. */
export function percentualEmTextoDecimal(centesimos: number): string {
  return `${Math.floor(centesimos / 100)}.${String(centesimos % 100).padStart(2, '0')}`
}

/** Para campo de formulário, no padrão brasileiro: `7,50`. */
export function percentualEmTextoDeCampo(centesimos: number): string {
  return percentualEmTextoDecimal(centesimos).replace('.', ',')
}
