import { z } from 'zod'
import {
  AUDIENCIAS_COMUNICADO,
  TIPOS_COMUNICADO,
} from '../constants/comunicado'

export const TAMANHO_MAXIMO_TITULO_COMUNICADO = 160
export const TAMANHO_MAXIMO_RESUMO_COMUNICADO = 600

/**
 * Campos de um comunicado.
 *
 * A data é aceita como texto ISO porque vem de um `<input type="datetime-local">`
 * e atravessa a fronteira da Server Action serializada. A conversão para `Date`
 * acontece na action, depois da validação — nunca antes.
 */
export const ComunicadoSchema = z.object({
  tipo: z.enum(TIPOS_COMUNICADO),
  titulo: z
    .string()
    .trim()
    .min(3, 'Escreva um título.')
    .max(TAMANHO_MAXIMO_TITULO_COMUNICADO),
  resumo: z
    .string()
    .trim()
    .min(3, 'Escreva o texto do comunicado.')
    .max(TAMANHO_MAXIMO_RESUMO_COMUNICADO),
  audiencia: z.enum(AUDIENCIAS_COMUNICADO).default('todos'),
  /**
   * Data de publicação.
   *
   * Vazio significa "agora, se publicar agora" — e não "sem data". Guardar a
   * distinção aqui evita que a tela precise inventar um valor só para poder
   * enviar o formulário.
   */
  publicadoEm: z
    .string()
    .trim()
    .refine((valor) => !valor || !Number.isNaN(Date.parse(valor)), {
      message: 'Data inválida.',
    })
    .optional()
    .default(''),
})

export const ComunicadoIdSchema = z.object({
  comunicadoId: z.string().uuid('Comunicado inválido.'),
})

export const AtualizarComunicadoSchema = ComunicadoIdSchema.extend(
  ComunicadoSchema.shape,
)

export type EntradaComunicado = z.infer<typeof ComunicadoSchema>
