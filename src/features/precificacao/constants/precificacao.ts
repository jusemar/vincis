/**
 * O vocabulário fixo da precificação dos planos Vincis.
 *
 * O que está aqui são **conceitos de negócio**, não dados: os quatro serviços
 * que a Vincis vende, as duas famílias de rotina e as três formas de cobrar por
 * quantidade. Preço, rótulo e regra de cada um vêm do banco — é justamente por
 * isso que os códigos precisam existir em código: alguém tem de saber o que
 * procurar na tabela.
 *
 * A separação também é a proteção dos tipos estruturais. `precificacao_servicos`
 * não tem caminho de exclusão, e estas constantes são a segunda garantia: uma
 * linha que sumisse do banco faria a validação da tabela falhar em vez de
 * produzir uma vitrine com três serviços e nenhum aviso.
 */

/** Famílias de rotina, cada uma com sua grade de preço-base por regime. */
export const GRUPOS_PRECIFICACAO = ['contabil', 'juridico'] as const
export type GrupoPrecificacao = (typeof GRUPOS_PRECIFICACAO)[number]

/** Os serviços vendidos. Fixos: o Gestor reajusta, não cadastra nem apaga. */
export const SERVICOS_PRECIFICACAO = [
  'padrao',
  'consultiva',
  'juridico',
  'combo',
] as const
export type ServicoPrecificacaoCodigo = (typeof SERVICOS_PRECIFICACAO)[number]

/** Perguntas de escolha do configurador. */
export const DIMENSOES_PRECIFICACAO = [
  'regime',
  'atividade',
  'emissor',
  'atendimento',
  'rotina',
] as const
export type DimensaoPrecificacaoCodigo =
  (typeof DIMENSOES_PRECIFICACAO)[number]

/** Perguntas numéricas — as que respondem por faixa em vez de por opção. */
export const TIPOS_FAIXA = [
  'funcionarios',
  'notas_fiscais',
  'faturamento',
] as const
export type TipoFaixa = (typeof TIPOS_FAIXA)[number]

export const MODOS_FAIXA = ['fixo', 'por_unidade'] as const
export type ModoFaixa = (typeof MODOS_FAIXA)[number]

export const TIPOS_DESCONTO = ['periodo', 'combo'] as const
export type TipoDesconto = (typeof TIPOS_DESCONTO)[number]

export const SELECOES_DIMENSAO = ['unica', 'multipla'] as const
export type SelecaoDimensao = (typeof SELECOES_DIMENSAO)[number]

/**
 * Parâmetros gerais, guardados no registro de configurações da plataforma.
 *
 * São dois números soltos que não pertencem a nenhuma grade — o múltiplo do
 * arredondamento final e a quantidade de funcionários com que o configurador
 * abre. `configuracoes_plataforma` existe exatamente para isto; criar uma
 * chave-valor própria da precificação seria um segundo registro de parâmetros
 * dizendo a mesma coisa.
 */
export const CHAVE_ARREDONDAMENTO = 'precificacao_arredondamento_centavos' as const
export const CHAVE_FUNCIONARIOS_PADRAO = 'precificacao_funcionarios_padrao' as const
