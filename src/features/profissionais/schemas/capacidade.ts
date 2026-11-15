import { z } from 'zod'

/** Teto prático do campo — evita digitação acidental de números absurdos. */
export const CAPACIDADE_MAXIMA_PERMITIDA = 10000

/**
 * Capacidade máxima de clientes recorrentes, como o formulário envia.
 *
 * Texto, para que "vazio" signifique **sem limite definido** sem virar zero:
 * zero não é capacidade (o banco recusa), e nulo é a ausência de limite.
 */
export const CapacidadeClientesSchema = z.object({
  usuarioId: z.string().uuid('Profissional inválido.'),
  capacidade: z
    .string()
    .trim()
    .refine(
      (valor) => valor === '' || (/^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= CAPACIDADE_MAXIMA_PERMITIDA),
      `Informe um número inteiro entre 1 e ${CAPACIDADE_MAXIMA_PERMITIDA}, ou deixe vazio para sem limite.`,
    ),
})
export type CapacidadeClientesDTO = z.infer<typeof CapacidadeClientesSchema>
