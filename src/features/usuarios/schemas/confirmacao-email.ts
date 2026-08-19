import { z } from 'zod'

export const ConfirmacaoEmailSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
})

export const ReenvioConfirmacaoSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Informe um e-mail válido')
    .transform((email) => email.toLowerCase()),
})

/** Confirmação manual de identidade pela Gestão, via WhatsApp cadastrado. */
export const ConfirmacaoWhatsappSchema = z.object({
  usuarioId: z.string().uuid('Usuário inválido'),
})

export type ConfirmacaoWhatsappDTO = z.infer<typeof ConfirmacaoWhatsappSchema>
export type ConfirmacaoEmailDTO = z.infer<typeof ConfirmacaoEmailSchema>
export type ReenvioConfirmacaoDTO = z.infer<typeof ReenvioConfirmacaoSchema>
