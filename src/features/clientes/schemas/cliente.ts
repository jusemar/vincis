import { z } from 'zod'

export const AREAS_CLIENTE = ['contabil', 'juridico', 'ambos'] as const
export const STATUS_CLIENTE = ['ativo', 'pendente', 'inativo'] as const
export const TIPOS_ATENDIMENTO = ['mensal', 'avulso'] as const

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34,
  35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62,
  63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85,
  86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

const TelefoneSchema = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ''))
  .superRefine((telefone, contexto) => {
    if (telefone.length !== 10 && telefone.length !== 11) {
      contexto.addIssue({
        code: 'custom',
        message: 'Informe um telefone brasileiro com DDD.',
      })
      return
    }

    const ddd = Number(telefone.slice(0, 2))
    const numero = telefone.slice(2)
    const inicioValido =
      (telefone.length === 11 && numero.startsWith('9')) ||
      (telefone.length === 10 && /^[2-5]/.test(numero))
    if (
      !DDDS_VALIDOS.has(ddd) ||
      !inicioValido ||
      /^(\d)\1+$/.test(telefone)
    ) {
      contexto.addIssue({
        code: 'custom',
        message: 'Informe um telefone brasileiro válido.',
      })
    }
  })

export function converterValorParaCentavos(valor: string) {
  return Number(valor.replace(/\D/g, ''))
}

export const ClienteSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome do cliente.')
    .max(255, 'O nome deve ter no máximo 255 caracteres.'),
  email: z
    .string()
    .trim()
    .email('Informe um e-mail válido.')
    .max(255, 'O e-mail deve ter no máximo 255 caracteres.'),
  telefone: TelefoneSchema,
  empresaNome: z
    .string()
    .trim()
    .max(255, 'A empresa deve ter no máximo 255 caracteres.')
    .optional()
    .default(''),
  area: z.enum(AREAS_CLIENTE, {
    error: 'Selecione uma área de atendimento.',
  }),
  status: z.enum(STATUS_CLIENTE, {
    error: 'Selecione uma situação válida.',
  }),
  tipoAtendimento: z
    .enum(TIPOS_ATENDIMENTO, {
      error: 'Selecione o tipo de atendimento.',
    })
    .optional()
    .default('mensal'),
  valorReferencia: z.string().optional().default(''),
  observacoes: z
    .string()
    .trim()
    .max(2000, 'As observações devem ter no máximo 2.000 caracteres.')
    .optional()
    .default(''),
  cep: z.string().regex(/^\d{8}$/, 'Informe um CEP válido com 8 números.'),
  logradouro: z.string().trim().min(2, 'Informe o logradouro.').max(255),
  numero: z.string().trim().min(1, 'Informe o número.').max(30),
  complemento: z.string().trim().max(120).optional().default(''),
  bairro: z.string().trim().min(2, 'Informe o bairro.').max(120),
  cidade: z.string().trim().min(2, 'Informe a cidade.').max(120),
  estado: z.string().trim().length(2, 'Informe o estado com 2 letras.').transform((valor) => valor.toUpperCase()),
}).superRefine((dados, contexto) => {
  if (dados.area === 'juridico') return

  const valor = converterValorParaCentavos(dados.valorReferencia)
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    contexto.addIssue({
      code: 'custom',
      path: ['valorReferencia'],
      message: 'Informe um valor maior que zero.',
    })
  } else if (valor > 100_000_000_00) {
    contexto.addIssue({
      code: 'custom',
      path: ['valorReferencia'],
      message: 'Informe um valor de referência válido.',
    })
  }
})

export const ClienteIdSchema = z.string().uuid('Cliente inválido.')

export const FiltrosClientesSchema = z.object({
  busca: z.string().trim().max(100).optional().default(''),
  status: z
    .enum(['todos', 'ativo', 'pendente', 'arquivados'])
    .optional()
    .default('todos'),
  pagina: z.coerce.number().int().min(1).optional().default(1),
})

export type ClienteDTO = z.input<typeof ClienteSchema>
export type ClienteValidado = z.output<typeof ClienteSchema>
export type FiltrosClientesDTO = z.input<typeof FiltrosClientesSchema>
