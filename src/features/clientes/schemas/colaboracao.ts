import { z } from 'zod'

export const STATUS_COLABORACAO = [
  'pendente',
  'aceito',
  'recusado',
  'expirado',
  'revogado',
] as const

export const DIAS_VALIDADE_COLABORACAO = 14

export const EnviarColaboracaoSchema = z.object({
  clienteId: z.string().uuid('Cliente inválido.'),
  destinatarioId: z.string().uuid('Profissional inválido.'),
  // Preparado para granularidade por serviço; hoje sempre nulo porque a
  // plataforma ainda não possui tabela de serviços.
  servicoId: z.string().uuid('Serviço inválido.').nullable().optional(),
})

export const ResponderColaboracaoSchema = z.object({
  colaboracaoId: z.string().uuid('Colaboração inválida.'),
  resposta: z.enum(['aceitar', 'recusar'], { error: 'Resposta inválida.' }),
})

export const RevogarColaboracaoSchema = z.object({
  colaboracaoId: z.string().uuid('Colaboração inválida.'),
})

export const PesquisaColaboradorSchema = z.object({
  clienteId: z.string().uuid('Cliente inválido.'),
  busca: z.string().trim().max(100, 'A busca deve ter no máximo 100 caracteres.'),
  profissao: z.string().optional().default('todos'),
  estado: z.string().max(2).optional().default(''),
  cidade: z.string().max(120).optional().default(''),
})

export type EnviarColaboracaoDTO = z.infer<typeof EnviarColaboracaoSchema>
export type StatusColaboracao = (typeof STATUS_COLABORACAO)[number]
