import { z } from 'zod'
import {
  TAMANHO_MAXIMO_MOTIVO_AJUSTE,
  TAMANHO_MAXIMO_RESPOSTA_AJUSTE,
  TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA,
} from '../constants/atendimento'

/**
 * Entrada da análise de uma solicitação de ajuste, validada no servidor.
 *
 * A tela também valida, mas quem decide é isto. `decisao` é um enum fechado —
 * não existe terceira via —, e o mínimo da justificativa vale para a recusa
 * porque recusar sem dizer por quê deixa o Cliente sem nada sobre o que agir.
 * A regra é repetida no domínio, que é quem grava: aqui ela só evita a ida ao
 * banco.
 */
export const AnaliseDeAjusteSchema = z
  .object({
    solicitacaoId: z.string().uuid('Solicitação inválida.'),
    decisao: z.enum(['aceitar', 'recusar']),
    resposta: z
      .string()
      .trim()
      .max(
        TAMANHO_MAXIMO_RESPOSTA_AJUSTE,
        `A resposta pode ter no máximo ${TAMANHO_MAXIMO_RESPOSTA_AJUSTE} caracteres.`,
      )
      .optional()
      .nullable(),
  })
  .refine(
    (dados) =>
      dados.decisao !== 'recusar' ||
      (dados.resposta?.length ?? 0) >= TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA,
    {
      path: ['resposta'],
      message: 'Explique brevemente o motivo da recusa.',
    },
  )

export type AnaliseDeAjusteDTO = z.infer<typeof AnaliseDeAjusteSchema>

/** Teto do motivo do Cliente, na fronteira. O domínio corta de novo. */
export const MotivoDeAjusteSchema = z
  .string()
  .trim()
  .min(1, 'Descreva o que precisa ser ajustado.')
  .max(
    TAMANHO_MAXIMO_MOTIVO_AJUSTE,
    `O texto pode ter no máximo ${TAMANHO_MAXIMO_MOTIVO_AJUSTE} caracteres.`,
  )
