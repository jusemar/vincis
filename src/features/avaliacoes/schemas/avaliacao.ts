import { z } from 'zod'
import {
  NOTA_MAXIMA,
  NOTA_MINIMA,
  TAMANHO_MAXIMO_COMENTARIO,
} from '../constants/avaliacao'

/**
 * Entrada da avaliação, validada no servidor.
 *
 * A tela também valida, mas quem decide é isto: `int()` recusa 4.5, os limites
 * recusam 0 e 6, e `null` não passa por ser obrigatório. A mesma faixa está no
 * CHECK da tabela — três camadas dizendo a mesma coisa, porque a nota é o único
 * campo que a reputação pública inteira multiplica.
 */
export const AvaliacaoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  nota: z
    .number({ error: 'Selecione de 1 a 5 estrelas.' })
    .int('A nota deve ser um número inteiro de 1 a 5.')
    .min(NOTA_MINIMA, 'A nota deve ser um número inteiro de 1 a 5.')
    .max(NOTA_MAXIMA, 'A nota deve ser um número inteiro de 1 a 5.'),
  /**
   * Comentário é opcional de verdade.
   *
   * `trim` antes de tudo: um texto só de espaços não é comentário, e gravá-lo
   * produziria um card público vazio no perfil do Prestador. Depois do trim, o
   * vazio vira ausência — nunca uma string em branco no banco.
   */
  comentario: z
    .string()
    .trim()
    .max(
      TAMANHO_MAXIMO_COMENTARIO,
      `O comentário pode ter no máximo ${TAMANHO_MAXIMO_COMENTARIO} caracteres.`,
    )
    .optional()
    .nullable(),
})

export type AvaliacaoDTO = z.infer<typeof AvaliacaoSchema>
