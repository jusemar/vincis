import { z } from 'zod'
import { RespostasSimulacaoSchema } from '@/features/precificacao-profissional/schemas/interesse'

/**
 * O que o navegador pode dizer ao contratar um plano da Vincis.
 *
 * Três coisas, e nenhuma delas é dinheiro: **qual** plano, **qual** prazo e o
 * cenário da empresa. Mensal, desconto e total são calculados no servidor, pelo
 * motor, sobre a tabela publicada — o cliente não tem como mandar "o total é um
 * centavo", porque não existe campo para isso.
 *
 * As respostas usam a mesma forma do interesse numa tabela individual: são as
 * mesmas perguntas do configurador. Os códigos são conferidos contra a tabela
 * real pelo próprio motor, que recusa resposta desconhecida.
 */
const codigo = z.string().trim().min(1).max(40)

/**
 * Quem vai ser o contador responsável: um contador parceiro escolhido pelo
 * cliente, ou a Vincis escolhe depois. Obrigatório e explícito — nada é
 * pré-selecionado. O id é só um pedido: a elegibilidade é conferida no
 * servidor.
 */
export const EscolhaContadorSchema = z.discriminatedUnion(
  'escolha',
  [
    z.object({ escolha: z.literal('cliente'), contadorId: z.string().uuid('Escolha um contador da lista.') }),
    z.object({ escolha: z.literal('vincis') }),
  ],
  { message: 'Escolha um contador ou deixe a Vincis escolher.' },
)

export const ContratarPlanoSchema = z.object({
  planoCodigo: codigo,
  periodoCodigo: codigo,
  respostas: RespostasSimulacaoSchema,
  contador: EscolhaContadorSchema,
})

export type ContratarPlanoDTO = z.input<typeof ContratarPlanoSchema>
