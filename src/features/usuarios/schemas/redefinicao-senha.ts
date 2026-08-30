import { z } from 'zod'
import { senhaSchema } from './base'

export const SolicitarRedefinicaoSenhaSchema = z.object({
  emailOuWhatsapp: z.string().trim().min(1, 'Informe e-mail ou WhatsApp'),
})

export const RedefinirSenhaSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  novaSenha: senhaSchema,
})

export type SolicitarRedefinicaoSenhaDTO = z.infer<typeof SolicitarRedefinicaoSenhaSchema>
export type RedefinirSenhaDTO = z.infer<typeof RedefinirSenhaSchema>
