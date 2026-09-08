/**
 * Vocabulário do Programa de Parceiros.
 *
 * Aqui moram as regras já decididas — e **só** elas. São três níveis, e o
 * percentual de cada um é a mesma fonte lida pelo card de níveis, pelo bloco do
 * sistema híbrido e pelo texto do Hero: sem isto, "5–10%" e a lista de níveis
 * viram dois lugares capazes de discordar, e o dia em que discordarem o
 * parceiro lê dois percentuais diferentes na mesma tela.
 *
 * Não existe Diamante. O nível mais alto é Ouro, com 10% — e é por isso que o
 * teto do intervalo recorrente é derivado da tabela (`FAIXA_RECORRENTE`) em vez
 * de escrito à mão.
 *
 * Nada aqui toca banco: o programa ainda não tem persistência. Este arquivo é
 * a regra comercial em forma de constante, para que a tela visual da aprovação
 * já mostre os números certos e a implementação real não precise reescrevê-los.
 */

export const NIVEIS_PARCEIRO = [
  {
    codigo: 'bronze',
    nome: 'Bronze',
    /** Percentual da comissão recorrente, em pontos percentuais. */
    percentual: 5,
    /** Mínimo de clientes recorrentes ativos para alcançar o nível. */
    minimoRecorrentes: 0,
    descricao: 'Entrada no programa.',
  },
  {
    codigo: 'prata',
    nome: 'Prata',
    percentual: 7.5,
    minimoRecorrentes: 4,
    descricao: 'A partir de 4 clientes recorrentes ativos.',
  },
  {
    codigo: 'ouro',
    nome: 'Ouro',
    percentual: 10,
    minimoRecorrentes: 10,
    descricao: 'A partir de 10 clientes recorrentes ativos.',
  },
] as const

export type NivelParceiro = (typeof NIVEIS_PARCEIRO)[number]
export type CodigoNivel = NivelParceiro['codigo']

/** Percentual formatado no padrão brasileiro: `7,5%`. */
export function percentualFormatado(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/**
 * O intervalo da comissão recorrente, derivado da tabela.
 *
 * O projeto de referência anunciava "5–15%", número que nunca existiu na regra
 * real. Derivar do primeiro e do último nível é o que impede o texto de
 * envelhecer sozinho quando um percentual mudar.
 */
export const FAIXA_RECORRENTE = {
  minimo: NIVEIS_PARCEIRO[0].percentual,
  maximo: NIVEIS_PARCEIRO[NIVEIS_PARCEIRO.length - 1].percentual,
} as const

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
 * Carência antes do rebaixamento, em dias.
 *
 * Aparece na tela como conceito — a pílula de proteção no card de níveis. Não
 * há relógio contando nada ainda: a regra existe, a implementação virá com o
 * backend do programa.
 */
export const DIAS_PROTECAO_DOWNGRADE = 30

/** Índice do nível na trilha; `-1` para código desconhecido. */
export function indiceDoNivel(codigo: CodigoNivel): number {
  return NIVEIS_PARCEIRO.findIndex((nivel) => nivel.codigo === codigo)
}

/** O próximo nível depois do atual, ou `null` quando já está no topo. */
export function proximoNivel(codigo: CodigoNivel): NivelParceiro | null {
  return NIVEIS_PARCEIRO[indiceDoNivel(codigo) + 1] ?? null
}

/**
 * Quanto falta para o próximo nível.
 *
 * Devolve o progresso em porcentagem e quantos recorrentes faltam. No topo da
 * trilha não existe "faltam N": o card passa a dizer que o nível é o máximo, em
 * vez de mostrar uma barra parada em 100% sem explicação.
 */
export function progressoParaProximoNivel(
  codigo: CodigoNivel,
  recorrentesAtivos: number,
): { percentual: number; faltam: number; proximo: NivelParceiro | null } {
  const proximo = proximoNivel(codigo)
  if (!proximo) return { percentual: 100, faltam: 0, proximo: null }

  const percentual = Math.min(
    100,
    Math.round((recorrentesAtivos / proximo.minimoRecorrentes) * 100),
  )
  return {
    percentual,
    faltam: Math.max(0, proximo.minimoRecorrentes - recorrentesAtivos),
    proximo,
  }
}
