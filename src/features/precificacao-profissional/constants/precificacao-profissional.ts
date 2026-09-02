/**
 * O vocabulário da precificação individual do Profissional.
 *
 * Tudo aqui é **recorte** da precificação da Vincis, e não um segundo
 * vocabulário: os códigos são os mesmos de `features/precificacao/constants`,
 * escolhidos entre os que existem lá. É de propósito — o dia em que estes
 * códigos deixarem de existir na Vincis, a derivação falha alto em vez de
 * produzir uma grade individual meio montada.
 */

import type {
  DimensaoPrecificacaoCodigo,
  GrupoPrecificacao,
  ServicoPrecificacaoCodigo,
  TipoFaixa,
} from '@/features/precificacao/constants/precificacao'

/**
 * O Profissional vende uma coisa só: a contabilidade mensal da empresa.
 *
 * Não existe escolha de produto na página dele — nem Padrão contra Consultiva,
 * nem Jurídico, nem Pacote. O código reaproveitado é `padrao` porque o motor
 * exige um dos serviços conhecidos; o **nome** exibido é outro, e vem de
 * `NOME_DO_SERVICO` abaixo.
 */
export const SERVICO_DO_PROFISSIONAL = 'padrao' satisfies ServicoPrecificacaoCodigo

/** Só a rotina contábil. A grade jurídica não entra na tabela individual. */
export const GRUPO_DO_PROFISSIONAL = 'contabil' satisfies GrupoPrecificacao

/**
 * Um único prazo, sem desconto.
 *
 * O motor exige ao menos um período de fechamento configurado — é dele que sai
 * a linha de preço do card. Oferecer só o mensal, com desconto zero, é como se
 * diz "aqui não há semestral, anual, parcelamento nem desconto por prazo" sem
 * precisar de nenhum `if` novo dentro do motor.
 */
export const PERIODO_DO_PROFISSIONAL = 'mensal'

export const NOME_DO_SERVICO = 'Contabilidade mensal'

/**
 * Arredondamento próprio: R$ 1, e não os R$ 5 da Vincis.
 *
 * Na vitrine da Vincis o múltiplo de R$ 5 é decisão comercial da casa. Aqui ele
 * seria uma surpresa: quem digita R$ 182 espera ver R$ 182, e veria R$ 180 sem
 * entender por quê. Um real é o menor múltiplo que ainda evita centavos quebrados
 * na multiplicação dos fatores.
 */
export const ARREDONDAMENTO_DO_PROFISSIONAL = 100

/** As três famílias de faixa que o Profissional precifica. */
export const TIPOS_DE_FAIXA_DO_PROFISSIONAL = [
  'funcionarios',
  'notas_fiscais',
  'faturamento',
] as const satisfies readonly TipoFaixa[]

/**
 * As dimensões cujo multiplicador o Profissional define.
 *
 * `regime` e `emissor` ficam de fora porque não multiplicam nada: o primeiro
 * escolhe qual preço-base vale, o segundo liga ou desliga a cobrança das faixas
 * de nota. Não são valores a configurar — são caminhos que o motor percorre.
 */
export const DIMENSOES_COM_FATOR = [
  'atividade',
  'atendimento',
  'rotina',
] as const satisfies readonly DimensaoPrecificacaoCodigo[]

/** Estado de um conjunto de valores: em edição ou no ar. */
export const ESTADOS_DA_CONFIGURACAO = ['rascunho', 'publicado'] as const
export type EstadoDaConfiguracao = (typeof ESTADOS_DA_CONFIGURACAO)[number]

/** As três origens de valor, e a unidade de cada uma. */
export const TIPOS_DE_VALOR = ['preco_base', 'faixa', 'fator'] as const
export type TipoDeValor = (typeof TIPOS_DE_VALOR)[number]

/** As seções em que o painel do Profissional agrupa os campos. */
export const SECOES_DO_PROFISSIONAL = [
  'precos_base',
  'atividade',
  'funcionarios',
  'notas_fiscais',
  'faturamento',
  'atendimento',
  'rotina',
] as const
export type SecaoDoProfissional = (typeof SECOES_DO_PROFISSIONAL)[number]

export const ROTULO_DA_SECAO: Record<SecaoDoProfissional, string> = {
  precos_base: 'Preço por enquadramento',
  atividade: 'Ramo da empresa',
  funcionarios: 'Funcionários',
  notas_fiscais: 'Notas fiscais',
  faturamento: 'Faturamento',
  atendimento: 'Forma de atendimento',
  rotina: 'Quem cuida da rotina',
}

/** Rota do painel onde o Profissional configura os próprios preços. */
export const ROTA_MEUS_PRECOS = '/admin/meus-precos'

/** Rota pública dos planos de um Profissional. */
export function rotaDosPrecosDoProfissional(prestadorId: string): string {
  return `/perfil-profissional/precos?prestador=${encodeURIComponent(prestadorId)}`
}
