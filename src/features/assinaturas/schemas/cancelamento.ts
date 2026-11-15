import { z } from 'zod'
import { TAMANHO_MAXIMO_MOTIVO_CANCELAMENTO } from '../constants/cancelamento'

/** Cliente cancela o próprio plano: só o id; dono e regra vêm do servidor. */
export const CancelarMeuPlanoSchema = z.object({
  assinaturaId: z.string().uuid('Plano inválido.'),
})

/** Gestão cancela com motivo obrigatório (texto livre). */
export const CancelarPlanoGestaoSchema = z.object({
  assinaturaId: z.string().uuid('Plano inválido.'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Informe o motivo do cancelamento.')
    .max(TAMANHO_MAXIMO_MOTIVO_CANCELAMENTO, `Use no máximo ${TAMANHO_MAXIMO_MOTIVO_CANCELAMENTO} caracteres.`),
})
export type CancelarPlanoGestaoDTO = z.infer<typeof CancelarPlanoGestaoSchema>
