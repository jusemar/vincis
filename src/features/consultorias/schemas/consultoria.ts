import { z } from 'zod'
import {
  ANTECEDENCIA_MAXIMA_MINUTOS,
  ANTECEDENCIA_PADRAO_MINUTOS,
  DURACAO_MAXIMA_MINUTOS,
  DURACAO_MINIMA_MINUTOS,
  DURACAO_PADRAO_MINUTOS,
  HORIZONTE_MAXIMO_DIAS,
  HORIZONTE_MINIMO_DIAS,
  HORIZONTE_PADRAO_DIAS,
  INTERVALO_MAXIMO_MINUTOS,
  INTERVALO_PADRAO_MINUTOS,
  LIMITE_FAIXAS_SEMANAIS,
  MODALIDADES_CONSULTORIA,
  MODALIDADE_PADRAO,
  TIMEZONE_PADRAO,
  TIPOS_EXCECAO,
} from '../constants/consultoria'
import { conferirFaixasSemanais } from '../lib/validacao-faixas'
import { dataLocalValida, minutosDeHora, timezoneValido } from '../lib/tempo'

/**
 * Validação de entrada da Consultoria Agendada.
 *
 * Cada limite aqui é o mesmo `check` que a tabela cobra — os números vivem em
 * `constants/consultoria.ts` justamente para não haver duas versões da mesma
 * regra. O Zod recusa cedo e com mensagem legível; o banco recusa por último e
 * sem depender de ninguém ter passado por aqui.
 */

export const HoraSchema = z
  .string()
  .trim()
  .refine((valor) => !Number.isNaN(minutosDeHora(valor)), {
    message: 'Informe um horário no formato HH:MM.',
  })

export const DataLocalSchema = z
  .string()
  .trim()
  .refine(dataLocalValida, { message: 'Informe uma data válida (AAAA-MM-DD).' })

/**
 * O fuso é conferido contra a base IANA do próprio runtime.
 *
 * Não existe lista fechada de fusos no código: uma lista escrita à mão
 * envelheceria e recusaria fuso legítimo. `America/Sao_Paulo` é só o padrão do
 * formulário — nunca a única possibilidade.
 */
export const TimezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine(timezoneValido, { message: 'Fuso horário inválido.' })

export const ConsultoriaConfiguracaoSchema = z.object({
  titulo: z.string().trim().min(3, 'Informe o nome da consultoria.').max(160),
  descricaoCurta: z
    .string()
    .trim()
    .min(5, 'Descreva a consultoria em uma linha.')
    .max(280),
  modalidade: z.enum(MODALIDADES_CONSULTORIA).default(MODALIDADE_PADRAO),
  /** Em centavos. Dinheiro nunca trafega como decimal nesta plataforma. */
  valorCentavos: z.coerce
    .number()
    .int('Informe o valor em centavos.')
    .positive('Informe um valor maior que zero.'),
  duracaoMinutos: z.coerce
    .number()
    .int()
    .min(DURACAO_MINIMA_MINUTOS, 'A duração precisa ser maior que zero.')
    .max(DURACAO_MAXIMA_MINUTOS, `A duração máxima é de ${DURACAO_MAXIMA_MINUTOS} minutos.`)
    .default(DURACAO_PADRAO_MINUTOS),
  intervaloMinutos: z.coerce
    .number()
    .int()
    .min(0, 'O intervalo não pode ser negativo.')
    .max(INTERVALO_MAXIMO_MINUTOS)
    .default(INTERVALO_PADRAO_MINUTOS),
  antecedenciaMinimaMinutos: z.coerce
    .number()
    .int()
    .min(0, 'A antecedência não pode ser negativa.')
    .max(ANTECEDENCIA_MAXIMA_MINUTOS)
    .default(ANTECEDENCIA_PADRAO_MINUTOS),
  horizonteDias: z.coerce
    .number()
    .int()
    .min(HORIZONTE_MINIMO_DIAS, 'O horizonte precisa cobrir ao menos um dia.')
    .max(HORIZONTE_MAXIMO_DIAS, `O horizonte máximo é de ${HORIZONTE_MAXIMO_DIAS} dias.`)
    .default(HORIZONTE_PADRAO_DIAS),
  timezone: TimezoneSchema.default(TIMEZONE_PADRAO),
  ativa: z.boolean().default(true),
})

export const FaixaSemanalSchema = z.object({
  diaSemana: z.coerce.number().int().min(0).max(6),
  horaInicio: HoraSchema,
  horaFim: HoraSchema,
})

/**
 * A semana inteira de uma vez.
 *
 * A action substitui o conjunto em bloco em vez de editar faixa a faixa: só
 * assim a checagem de sobreposição enxerga o estado final. Editar uma por vez
 * permitiria passar por um estado intermediário inválido — ou recusar uma troca
 * legítima de horário só porque a antiga ainda estava lá.
 */
export const FaixasSemanaisSchema = z
  .array(FaixaSemanalSchema)
  .max(LIMITE_FAIXAS_SEMANAIS, `Limite de ${LIMITE_FAIXAS_SEMANAIS} períodos por semana.`)
  .superRefine((faixas, ctx) => {
    for (const problema of conferirFaixasSemanais(faixas)) {
      ctx.addIssue({
        code: 'custom',
        path: [problema.indice],
        message: problema.mensagem,
      })
    }
  })

export const ExcecaoSchema = z
  .object({
    data: DataLocalSchema,
    tipo: z.enum(TIPOS_EXCECAO),
    horaInicio: HoraSchema.optional(),
    horaFim: HoraSchema.optional(),
    motivo: z.string().trim().max(240).optional(),
  })
  .superRefine((dados, ctx) => {
    // Mesma coerência que o `check` da tabela cobra, dita aqui em português.
    if (dados.tipo === 'indisponivel_dia') {
      if (dados.horaInicio || dados.horaFim) {
        ctx.addIssue({
          code: 'custom',
          path: ['tipo'],
          message: 'Um dia indisponível não tem horário — ele cobre o dia inteiro.',
        })
      }
      return
    }
    if (!dados.horaInicio || !dados.horaFim) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaInicio'],
        message: 'Informe o horário inicial e o final.',
      })
      return
    }
    if (minutosDeHora(dados.horaInicio) >= minutosDeHora(dados.horaFim)) {
      ctx.addIssue({
        code: 'custom',
        path: ['horaFim'],
        message: 'O horário final precisa ser maior que o inicial.',
      })
    }
  })

export const ExcecaoIdSchema = z.string().uuid('Exceção inválida.')
export const PrestadorIdSchema = z.string().uuid('Profissional inválido.')

export type ConsultoriaConfiguracaoDTO = z.input<typeof ConsultoriaConfiguracaoSchema>
export type ConsultoriaConfiguracaoValidada = z.output<typeof ConsultoriaConfiguracaoSchema>
export type FaixaSemanalDTO = z.input<typeof FaixaSemanalSchema>
export type ExcecaoDTO = z.input<typeof ExcecaoSchema>
