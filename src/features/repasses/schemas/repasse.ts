import { z } from 'zod'
import { COMPROVANTE_MAX, OBSERVACAO_MAX } from '../constants/repasse'

/**
 * Registro do repasse manual. Validado no cliente (react-hook-form) e de novo
 * na Server Action — a tela nunca é a única barreira.
 *
 * `repassadoEm` é a data da transferência feita por fora (AAAA-MM-DD); não
 * pode ser futura. O comprovante é a identificação da transferência (E2E do
 * Pix, número do comprovante bancário…), obrigatório.
 */
export const RegistrarRepasseSchema = z.object({
  repasseId: z.string().uuid('Repasse inválido.'),
  repassadoEm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do repasse.')
    .refine((texto) => !Number.isNaN(Date.parse(`${texto}T12:00:00Z`)), 'Data inválida.'),
  comprovante: z
    .string()
    .trim()
    .min(4, 'Informe a identificação ou o comprovante da transferência.')
    .max(COMPROVANTE_MAX, `Use no máximo ${COMPROVANTE_MAX} caracteres.`),
  observacao: z
    .string()
    .trim()
    .max(OBSERVACAO_MAX, `Use no máximo ${OBSERVACAO_MAX} caracteres.`)
    .optional()
    .or(z.literal('')),
})

export type RegistrarRepasseDTO = z.infer<typeof RegistrarRepasseSchema>
