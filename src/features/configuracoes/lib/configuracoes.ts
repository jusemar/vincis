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

/** Texto guardado → número válido. Valor corrompido cai no padrão. */
export function lerNumero(chave: ChaveConfiguracao, valor: string | null | undefined) {
  const definicao = CONFIGURACOES[chave]
  const numero = Number.parseInt((valor ?? '').trim(), 10)
  if (!Number.isFinite(numero)) return definicao.padrao
  if (numero < definicao.minimo || numero > definicao.maximo) return definicao.padrao
  return numero
}
