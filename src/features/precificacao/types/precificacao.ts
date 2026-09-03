import type { z } from 'zod'
import type {
  AdicionalPrecificacaoSchema,
  DescontoPrecificacaoSchema,
  DimensaoPrecificacaoSchema,
  FaixaPrecificacaoSchema,
  OpcaoPrecificacaoSchema,
  ParametrosPrecificacaoSchema,
  PrecoBaseSchema,
  ServicoPrecificacaoSchema,
  TabelaPrecificacaoSchema,
} from '../schemas/precificacao'

/**
 * Os tipos do domínio saem dos esquemas, e não de uma segunda declaração.
 *
 * Duas fontes divergiriam no primeiro campo novo — e a que o TypeScript
 * conferisse não seria a que o banco valida.
 */
export type ServicoPrecificacao = z.output<typeof ServicoPrecificacaoSchema>
export type PrecoBase = z.output<typeof PrecoBaseSchema>
export type OpcaoPrecificacao = z.output<typeof OpcaoPrecificacaoSchema>
export type DimensaoPrecificacao = z.output<typeof DimensaoPrecificacaoSchema>
export type FaixaPrecificacao = z.output<typeof FaixaPrecificacaoSchema>
export type AdicionalPrecificacao = z.output<typeof AdicionalPrecificacaoSchema>
export type DescontoPrecificacao = z.output<typeof DescontoPrecificacaoSchema>
export type ParametrosPrecificacao = z.output<
  typeof ParametrosPrecificacaoSchema
>

/** A configuração comercial inteira, já validada. Entrada do motor da Etapa 3. */
export type TabelaPrecificacao = z.output<typeof TabelaPrecificacaoSchema>

/* ----------------------------------------------------- entrada e saída do motor */

/**
 * O que a empresa respondeu sobre si.
 *
 * Os campos guardam **códigos** da tabela, não rótulos nem valores: é o que
 * permite reajustar um preço ou renomear uma faixa sem invalidar uma resposta
 * já dada. `funcionarios` é a única quantidade — as demais perguntas numéricas
 * são respondidas por faixa no configurador, exatamente como antes.
 */
export interface RespostasPrecificacao {
  regime: string
  /** Escolha múltipla; só a primeira multiplica o preço, como sempre foi. */
  atividades: string[]
  funcionarios: number
  notasFiscais: string
  emissor: string
  faturamento: string
  atendimento: string
  rotina: string
  adicionais: string[]
}

/** Uma parcela do preço. O rótulo exibido é decidido por quem desenha. */
export interface LinhaComposicao {
  tipo:
    | 'base'
    | 'funcionarios'
    | 'notas_fiscais'
    | 'faturamento'
    | 'adicional'
    | 'componente'
    | 'desconto_combo'
  valorCentavos: number
  codigo?: string
  rotulo?: string
  quantidade?: number
}

/**
 * Um acréscimo que incidiu sobre o núcleo, e de onde ele veio.
 *
 * Exatamente um dos dois campos é preenchido: a opção **multiplica** o subtotal
 * ou **soma** um valor fixo a ele. Os dois estão aqui, e nenhum deles é
 * opcional, porque quem exibe a composição precisa dizer qual das duas coisas
 * aconteceu — "×1,12" e "+ R$ 20,00" são leituras diferentes da mesma linha.
 */
export interface FatorAplicado {
  dimensao: string
  opcao: string
  rotulo: string
  /** Multiplicador em milésimos. `null` quando a opção cobra valor fixo. */
  multiplicadorMilesimos: number | null
  /** Acréscimo fixo em centavos. `null` quando a opção multiplica. */
  acrescimoCentavos: number | null
}

/** O mesmo preço mensal visto por prazo de fechamento. */
export interface PrecoPeriodo {
  periodo: string
  rotulo: string
  meses: number
  descontoMilesimos: number
  descontoPercentual: number
  /** Equivalente mensal já com o desconto do prazo. */
  mensalCentavos: number
  economiaMensalCentavos: number
  totalPeriodoCentavos: number
}

/** O que a soma de outros serviços produziu — hoje, o Pacote Empresarial. */
export interface ComposicaoCombo {
  componentes: ResultadoPrecificacao[]
  separadoCentavos: number
  economiaMensalCentavos: number
  economiaAnualCentavos: number
  descontoMilesimos: number
}

/**
 * O preço e a conta que levou até ele.
 *
 * Tudo em centavos inteiros. Quem exibe formata; quem contrata guarda. Nenhuma
 * tela precisa refazer subtração alguma para mostrar "como chegamos nesse
 * valor" — as linhas, os fatores e o arredondamento já vêm daqui.
 */
export interface ResultadoPrecificacao {
  servico: string
  linhas: LinhaComposicao[]
  fatores: FatorAplicado[]
  /** Núcleo depois dos fatores e antes dos adicionais e do arredondamento. */
  nucleoCentavos: number
  adicionaisCentavos: number
  /** Diferença que o arredondamento final introduziu. Pode ser negativa. */
  arredondamentoCentavos: number
  mensalCentavos: number
  periodos: PrecoPeriodo[]
  combo: ComposicaoCombo | null
}
