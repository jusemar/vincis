import { z } from 'zod'
import {
  DIMENSOES_PRECIFICACAO,
  GRUPOS_PRECIFICACAO,
  MODOS_FAIXA,
  SELECOES_DIMENSAO,
  SERVICOS_PRECIFICACAO,
  TIPOS_DESCONTO,
  TIPOS_FAIXA,
} from '../constants/precificacao'

/**
 * O contrato de uma tabela de precificação válida.
 *
 * ## Por que validar o que veio do próprio banco
 *
 * Porque os `check` do Postgres garantem cada linha isoladamente e não a grade
 * inteira: nenhum deles sabe dizer que faltou o preço-base do Lucro Real, que
 * duas faixas de faturamento se sobrepõem ou que o Pacote aponta para um
 * serviço desligado. Essas são condições **entre** linhas, e é o motor de
 * preço que quebraria com elas — silenciosamente, cobrando a faixa errada. Aqui
 * a leitura falha alto, antes de virar preço na tela de alguém.
 *
 * Os mesmos esquemas serão a validação de escrita da tela do Gestor: uma
 * configuração que não passaria na leitura não deve conseguir ser gravada.
 */

const centavos = z
  .number()
  .int('Valores monetários são inteiros, em centavos.')
  .min(0, 'Valor não pode ser negativo.')

const milesimos = z.number().int().positive()

export const ServicoPrecificacaoSchema = z
  .object({
    codigo: z.enum(SERVICOS_PRECIFICACAO),
    nome: z.string().trim().min(1).max(80),
    chamada: z.string().trim().min(1).max(400),
    grupoBase: z.enum(GRUPOS_PRECIFICACAO).nullable(),
    multiplicadorMilesimos: milesimos.nullable(),
    componentes: z.array(z.enum(SERVICOS_PRECIFICACAO)),
    destaque: z.boolean(),
    ordem: z.number().int(),
    ativo: z.boolean(),
  })
  .refine(
    (s) =>
      s.grupoBase === null
        ? s.multiplicadorMilesimos === null && s.componentes.length >= 2
        : s.multiplicadorMilesimos !== null && s.componentes.length === 0,
    'Um serviço parte de um preço-base ou compõe outros serviços — nunca os dois.',
  )
  .refine(
    (s) => !s.componentes.includes(s.codigo),
    'Um serviço composto não pode conter a si mesmo.',
  )

export const PrecoBaseSchema = z.object({
  grupo: z.enum(GRUPOS_PRECIFICACAO),
  regime: z.string().trim().min(1).max(30),
  valorCentavos: centavos,
})

export const OpcaoPrecificacaoSchema = z.object({
  dimensaoCodigo: z.enum(DIMENSOES_PRECIFICACAO),
  codigo: z.string().trim().min(1).max(30),
  rotulo: z.string().trim().min(1).max(120),
  ajuda: z.string().trim().max(240).nullable(),
  multiplicadorMilesimos: milesimos.nullable(),
  /**
   * Acréscimo em centavos, para a opção que cobra valor fixo em vez de
   * multiplicar.
   *
   * Ausente ou `null` é o caso de sempre: a opção multiplica o subtotal por
   * `multiplicadorMilesimos`. Preenchido, ela **soma** este valor ao subtotal
   * no mesmo ponto da conta em que multiplicaria — e aí o multiplicador não é
   * consultado. As duas formas nunca valem juntas.
   *
   * Nasceu para a precificação individual do Profissional, onde "Híbrido"
   * pode ser "12% a mais" ou "R$ 20 a mais", à escolha de quem cobra. A
   * precificação da Vincis não grava este campo em lugar nenhum: a coluna não
   * existe em `precificacao_opcoes`, então toda opção da casa chega aqui sem
   * ele e continua multiplicando exatamente como antes.
   */
  acrescimoCentavos: centavos.nullable().optional(),
  padrao: z.boolean(),
  ordem: z.number().int(),
  ativo: z.boolean(),
})

export const DimensaoPrecificacaoSchema = z.object({
  codigo: z.enum(DIMENSOES_PRECIFICACAO),
  rotulo: z.string().trim().min(1).max(120),
  aplicaAGrupos: z.array(z.enum(GRUPOS_PRECIFICACAO)).min(1),
  selecao: z.enum(SELECOES_DIMENSAO),
  ordem: z.number().int(),
  opcoes: z.array(OpcaoPrecificacaoSchema).min(1),
})

export const FaixaPrecificacaoSchema = z
  .object({
    grupo: z.enum(GRUPOS_PRECIFICACAO),
    tipo: z.enum(TIPOS_FAIXA),
    codigo: z.string().trim().min(1).max(30),
    rotulo: z.string().trim().min(1).max(120),
    limiteMin: z.number().int().min(0),
    limiteMax: z.number().int().positive().nullable(),
    valorCentavos: centavos,
    modo: z.enum(MODOS_FAIXA),
    emissorExigido: z.string().trim().max(30).nullable(),
    padrao: z.boolean(),
    ordem: z.number().int(),
  })
  .refine(
    (f) => f.limiteMax === null || f.limiteMax > f.limiteMin,
    'Faixa invertida: o limite superior precisa ser maior que o inferior.',
  )

export const AdicionalPrecificacaoSchema = z.object({
  codigo: z.string().trim().min(1).max(40),
  rotulo: z.string().trim().min(1).max(120),
  descricao: z.string().trim().min(1).max(240),
  valorMensalCentavos: centavos,
  disponivelParaGrupos: z.array(z.enum(GRUPOS_PRECIFICACAO)).min(1),
  ordem: z.number().int(),
  ativo: z.boolean(),
})

export const DescontoPrecificacaoSchema = z
  .object({
    codigo: z.string().trim().min(1).max(30),
    tipo: z.enum(TIPOS_DESCONTO),
    rotulo: z.string().trim().min(1).max(120),
    meses: z.number().int().positive().nullable(),
    servicoCodigo: z.enum(SERVICOS_PRECIFICACAO).nullable(),
    /** Fração × 1000. 100% zeraria a mensalidade e não é desconto. */
    descontoMilesimos: z.number().int().min(0).max(999),
    ordem: z.number().int(),
  })
  .refine(
    (d) =>
      d.tipo === 'periodo'
        ? d.meses !== null && d.servicoCodigo === null
        : d.meses === null && d.servicoCodigo !== null,
    'Desconto de período tem duração; desconto de combo tem serviço.',
  )

export const ParametrosPrecificacaoSchema = z.object({
  /** Múltiplo do arredondamento final, em centavos. 500 = R$ 5. */
  arredondamentoCentavos: z.number().int().min(1).max(100_000),
  funcionariosPadrao: z.number().int().min(0).max(200),
})

export const TabelaPrecificacaoSchema = z.object({
  servicos: z.array(ServicoPrecificacaoSchema),
  precosBase: z.array(PrecoBaseSchema),
  dimensoes: z.array(DimensaoPrecificacaoSchema),
  faixas: z.array(FaixaPrecificacaoSchema),
  adicionais: z.array(AdicionalPrecificacaoSchema),
  descontos: z.array(DescontoPrecificacaoSchema),
  parametros: ParametrosPrecificacaoSchema,
})
