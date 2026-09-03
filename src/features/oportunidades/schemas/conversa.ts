import { z } from 'zod'
import { LIMITE_MENSAGEM_OPORTUNIDADE } from '../constants/oportunidade'

/**
 * Uma mensagem da conversa da Oportunidade.
 *
 * Texto e nada mais: sem valor, sem prazo, sem anexo. É a diferença entre esta
 * conversa e a proposta — ali se combina preço, aqui se conversa.
 */
export const NovaMensagemDaOportunidadeSchema = z.object({
  oportunidadeId: z.string().uuid('Oportunidade inválida.'),
  conteudo: z
    .string()
    .trim()
    .min(1, 'Escreva sua mensagem.')
    .max(
      LIMITE_MENSAGEM_OPORTUNIDADE,
      `A mensagem deve ter no máximo ${LIMITE_MENSAGEM_OPORTUNIDADE} caracteres.`,
    ),
})
