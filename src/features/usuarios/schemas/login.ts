import { z } from 'zod'
import { senhaSchema } from './base'

export const LoginSchema = z.object({
  emailOuWhatsapp: z.string().min(1, 'Informe e-mail ou WhatsApp'),
  senha: senhaSchema,
})

export type LoginDTO = z.infer<typeof LoginSchema>
