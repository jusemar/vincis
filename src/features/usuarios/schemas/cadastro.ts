import { z } from 'zod'
import { emailSchema, senhaSchema, whatsappSchema, nomeSchema } from './base'

// Tipos de conta que podem ser criados pela tela de cadastro. `contador` e
// `advogado` são nomes legados do catálogo de perfis, mantidos para não
// invalidar integrações antigas — o fluxo atual usa `profissional`.
export const perfilTipoEnum = z.enum([
  'cliente',
  'contador',
  'advogado',
  'profissional',
  'colaborador',
])

export const CadastroUsuarioSchema = z.object({
  nome: nomeSchema,
  email: emailSchema,
  whatsapp: whatsappSchema,
  senha: senhaSchema,
  perfilTipo: perfilTipoEnum,
})

export type CadastroUsuarioDTO = z.infer<typeof CadastroUsuarioSchema>
