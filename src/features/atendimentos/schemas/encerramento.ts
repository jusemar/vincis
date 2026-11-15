import { z } from 'zod'
import {
  MOTIVOS_ENCERRAMENTO_SEM_CONCLUSAO,
  TAMANHO_MAXIMO_OBSERVACAO_ENCERRAMENTO,
  TAMANHO_MINIMO_OBSERVACAO_ENCERRAMENTO,
} from '../constants/atendimento'

/**
 * O que a Gestão informa ao encerrar um Atendimento sem conclusão.
 *
 * Motivo e observação são **obrigatórios**: encerrar sem dizer por quê
 * deixaria a próxima pessoa (ou uma contestação futura) sem nada para ler.
 * O mesmo schema valida no formulário e na action.
 */
export const EncerrarSemConclusaoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
  motivo: z.enum(MOTIVOS_ENCERRAMENTO_SEM_CONCLUSAO, {
    message: 'Escolha o motivo do encerramento.',
  }),
  observacaoInterna: z
    .string()
    .trim()
    .min(
      TAMANHO_MINIMO_OBSERVACAO_ENCERRAMENTO,
      `Descreva a situação em pelo menos ${TAMANHO_MINIMO_OBSERVACAO_ENCERRAMENTO} caracteres.`,
    )
    .max(
      TAMANHO_MAXIMO_OBSERVACAO_ENCERRAMENTO,
      `A observação deve ter no máximo ${TAMANHO_MAXIMO_OBSERVACAO_ENCERRAMENTO} caracteres.`,
    ),
})

export type EncerrarSemConclusaoDTO = z.input<typeof EncerrarSemConclusaoSchema>
