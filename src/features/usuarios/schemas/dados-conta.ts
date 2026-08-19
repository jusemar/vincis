import { z } from 'zod'
import { nomeSchema, whatsappSchema } from './base'

/**
 * Dados que o titular da conta pode editar sozinho.
 *
 * O e-mail fica de fora de propósito: ele é o identificador de login e, quando
 * confirmado, é uma afirmação verificada. Trocá-lo exigiria um fluxo próprio de
 * reconfirmação, que não existe hoje — permitir a edição aqui derrubaria a
 * garantia sem substituí-la por nada.
 */
export const DadosContaSchema = z.object({
  nome: nomeSchema,
  whatsapp: whatsappSchema,
})

export type DadosContaDTO = z.infer<typeof DadosContaSchema>
