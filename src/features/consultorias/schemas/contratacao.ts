import { z } from 'zod'
import { LIMITE_DESCRICAO_CONSULTORIA } from '../constants/contratacao'
import { DataLocalSchema, HoraSchema, PrestadorIdSchema } from './consultoria'

/**
 * Contrato de entrada da contratação.
 *
 * O mesmo schema roda nos dois lados: o modal o usa para acender o erro
 * enquanto se digita, e a Server Action o usa antes de olhar para a sessão.
 * Isso é deliberado — a exigência de que a validação "não dependa apenas do
 * React" só é atendida se a regra for **uma**, e não uma no componente e outra
 * no servidor, que é como um campo passa a aceitar na tela o que o backend
 * recusa.
 *
 * Repare no que **não** é aceito daqui: preço, duração, título, fuso e
 * modalidade. Tudo isso o servidor relê da configuração do Profissional. Se o
 * navegador pudesse enviá-los, bastaria um `fetch` à mão para contratar uma
 * consultoria de R$ 250 por R$ 1.
 */

export const DescricaoConsultoriaSchema = z
  .string()
  .trim()
  .min(1, 'Conte brevemente o que você precisa tratar na consultoria.')
  .max(
    LIMITE_DESCRICAO_CONSULTORIA,
    `Use no máximo ${LIMITE_DESCRICAO_CONSULTORIA} caracteres.`,
  )

export const PrepararContratacaoSchema = z.object({
  prestadorId: PrestadorIdSchema,
  /** Data local da agenda, no fuso do Profissional. */
  data: DataLocalSchema,
  /** Início escolhido, `HH:MM`. O fim vem da duração gravada, nunca do cliente. */
  inicio: HoraSchema,
  descricao: DescricaoConsultoriaSchema,
})

export type PrepararContratacaoDTO = z.input<typeof PrepararContratacaoSchema>
