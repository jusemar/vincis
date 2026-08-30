import { z } from 'zod'
import {
  DIMENSOES_PRECIFICACAO,
  GRUPOS_PRECIFICACAO,
} from '../constants/precificacao'

/**
 * O que a tela do Gestor pode mandar salvar.
 *
 * Os campos chegam **na unidade da tela** — reais e porcentagem — e é a action
 * que converte. Validar aqui em reais é o que permite dizer "o preço não pode
 * passar de R$ 100.000" numa mensagem que faz sentido para quem está digitando.
 *
 * `impressao` acompanha toda seção: é o retrato dos valores que o formulário
 * abriu, conferido dentro da transação para que duas sessões abertas não
 * sobrescrevam uma à outra em silêncio.
 */

/** Reais com, no máximo, os centavos. Nada de fração de centavo. */
const reais = z
  .number({ message: 'Informe um valor em reais.' })
  .min(0, 'O valor não pode ser negativo.')
  .max(100_000, 'O valor máximo é R$ 100.000,00.')
  .refine(
    (valor) => Number.isInteger(Math.round(valor * 100)),
    'Use no máximo duas casas decimais.',
  )

/** Acréscimo percentual sobre a base. 0 significa "sem acréscimo". */
const acrescimo = z
  .number({ message: 'Informe uma porcentagem.' })
  .min(0, 'O acréscimo não pode ser negativo.')
  .max(900, 'O acréscimo máximo é 900%.')
  .refine(
    (valor) => Number.isInteger(Math.round(valor * 10)),
    'Use no máximo uma casa decimal.',
  )

/** Desconto percentual. 100% zeraria a mensalidade e não é desconto. */
const desconto = z
  .number({ message: 'Informe uma porcentagem.' })
  .min(0, 'O desconto não pode ser negativo.')
  .max(99.9, 'O desconto máximo é 99,9%.')
  .refine(
    (valor) => Number.isInteger(Math.round(valor * 10)),
    'Use no máximo uma casa decimal.',
  )

const impressao = z.string().min(1)

export const PrecosBaseSchema = z.object({
  impressao,
  precos: z
    .array(
      z.object({
        grupo: z.enum(GRUPOS_PRECIFICACAO),
        regime: z.string().trim().min(1).max(30),
        valorReais: reais,
      }),
    )
    .min(1, 'Nenhum preço informado.'),
  /** Acréscimo da Consultiva sobre a base contábil, em porcentagem. */
  acrescimoConsultiva: acrescimo,
})

export const FaixasValoresSchema = z.object({
  impressao,
  tipo: z.enum(['funcionarios', 'notas_fiscais', 'faturamento']),
  faixas: z
    .array(
      z.object({
        grupo: z.enum(GRUPOS_PRECIFICACAO),
        codigo: z.string().trim().min(1).max(30),
        valorReais: reais,
      }),
    )
    .min(1, 'Nenhuma faixa informada.'),
})

export const FatoresSchema = z.object({
  impressao,
  dimensao: z.enum(DIMENSOES_PRECIFICACAO),
  opcoes: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(30),
        acrescimoPercentual: acrescimo,
      }),
    )
    .min(1, 'Nenhuma opção informada.'),
})

export const AdicionaisSchema = z.object({
  impressao,
  adicionais: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(40),
        valorReais: reais,
        ativo: z.boolean(),
      }),
    )
    .min(1, 'Nenhum adicional informado.'),
})

export const DescontosSchema = z.object({
  impressao,
  descontos: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(30),
        percentual: desconto,
      }),
    )
    .min(1, 'Nenhum desconto informado.'),
})

export type EntradaPrecosBase = z.output<typeof PrecosBaseSchema>
export type EntradaFaixasValores = z.output<typeof FaixasValoresSchema>
export type EntradaFatores = z.output<typeof FatoresSchema>
export type EntradaAdicionais = z.output<typeof AdicionaisSchema>
export type EntradaDescontos = z.output<typeof DescontosSchema>
