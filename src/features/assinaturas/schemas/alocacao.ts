import { z } from 'zod'
import { TAMANHO_MAXIMO_MOTIVO } from '../constants/contador-responsavel'

/** Alocar ou trocar o contador responsável — mesma validação na tela e no servidor. */
export const AlocarContadorSchema = z.object({
  assinaturaId: z.string().uuid('Plano inválido.'),
  contadorId: z.string().uuid('Escolha um contador.'),
  motivo: z
    .string()
    .trim()
    .max(TAMANHO_MAXIMO_MOTIVO, `O motivo pode ter até ${TAMANHO_MAXIMO_MOTIVO} caracteres.`)
    .optional()
    .default(''),
})

export type AlocarContadorDTO = z.input<typeof AlocarContadorSchema>
