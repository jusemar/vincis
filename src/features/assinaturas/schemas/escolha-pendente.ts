import { z } from 'zod'
import { EscolhaContadorSchema } from './contratacao'

/** Nova escolha de contador num plano pendente cujo contador lotou. */
export const EscolhaDoPlanoPendenteSchema = z.object({
  assinaturaId: z.string().uuid('Plano inválido.'),
  contador: EscolhaContadorSchema,
})
