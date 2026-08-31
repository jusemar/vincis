/**
 * Configurações da plataforma, definidas pela Gestão Vincis.
 *
 * Um registro por parâmetro em `configuracoes_plataforma`, com o significado e
 * os limites declarados aqui — o banco guarda texto, e é este arquivo que diz o
 * que aquele texto quer dizer. O `padrao` existe porque a plataforma precisa
 * funcionar antes de a Gestão abrir a tela pela primeira vez; ele não é a
 * regra, é o ponto de partida dela.
 */

export const CHAVE_PRAZO_OPORTUNIDADE = 'oportunidade_prazo_horas' as const

/**
 * Os dois números soltos da precificação dos planos.
 *
 * Eles não pertencem a nenhuma grade de `precificacao_*` — o arredondamento é
 * do resultado final e a quantidade de funcionários é com o que o configurador
 * abre —, e são exatamente o tipo de decisão de produto que este registro
 * existe para guardar. Uma chave-valor própria da precificação seria um segundo
 * registro de parâmetros da plataforma dizendo a mesma coisa.
 */
export const CHAVE_PRECIFICACAO_ARREDONDAMENTO =
  'precificacao_arredondamento_centavos' as const
export const CHAVE_PRECIFICACAO_FUNCIONARIOS_PADRAO =
  'precificacao_funcionarios_padrao' as const

export const CONFIGURACOES = {
  [CHAVE_PRECIFICACAO_ARREDONDAMENTO]: {
    rotulo: 'Arredondamento do preço final',
    ajuda:
      'Múltiplo, em centavos, a que o valor mensal calculado é arredondado antes de ser exibido. 500 arredonda para R$ 5.',
    unidade: 'centavos',
    /** Equivale ao arredondamento de R$ 5 que a página já aplicava. */
    padrao: 500,
    minimo: 1,
    maximo: 100000,
  },
  [CHAVE_PRECIFICACAO_FUNCIONARIOS_PADRAO]: {
    rotulo: 'Funcionários no configurador de preços',
    ajuda:
      'Quantidade com que o campo de funcionários abre em /precos, antes de a pessoa mexer.',
    unidade: 'funcionários',
    padrao: 3,
    minimo: 0,
    maximo: 200,
  },
  [CHAVE_PRAZO_OPORTUNIDADE]: {
    rotulo: 'Prazo máximo da oportunidade pública',
    ajuda:
      'Tempo, a partir da publicação, em que uma solicitação pode receber propostas e fechar acordo. Depois disso ela expira.',
    unidade: 'horas',
    /** Ponto de partida técnico. A Gestão pode alterar a qualquer momento. */
    padrao: 48,
    minimo: 1,
    maximo: 720,
  },
} as const

export type ChaveConfiguracao = keyof typeof CONFIGURACOES

/**
 * Texto guardado → número válido.
 *
 * **Ausente** e **ilegível** não são a mesma coisa, e por isso terminam
 * diferente. Sem registro, vale o `padrao`: é o ponto de partida documentado,
 * e é para isso que ele existe. Com registro que não se lê — texto que não é
 * número, ou número fora dos limites declarados —, a leitura falha.
 *
 * Cair no padrão nesse segundo caso era um fallback silencioso: o
 * arredondamento do preço voltaria a R$ 5 porque o valor gravado ficou
 * corrompido, e ninguém veria diferença nenhuma até alguém contratar pelo
 * número errado. Falhar aqui leva `/precos` à página comercial de
 * indisponibilidade — que é a decisão desta etapa: entre um preço em que não se
 * pode confiar e nenhum preço, a Vincis prefere nenhum.
 */
export function lerNumero(chave: ChaveConfiguracao, valor: string | null | undefined) {
  const definicao = CONFIGURACOES[chave]
  const texto = (valor ?? '').trim()
  if (texto === '') return definicao.padrao

  const numero = Number.parseInt(texto, 10)
  if (!Number.isFinite(numero)) {
    throw new Error(`Configuração ${chave} guardada em formato ilegível.`)
  }
  if (numero < definicao.minimo || numero > definicao.maximo) {
    throw new Error(
      `Configuração ${chave} fora dos limites (${definicao.minimo}–${definicao.maximo}).`,
    )
  }
  return numero
}
