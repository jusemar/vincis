import { z } from 'zod'

/**
 * O cenário que o cliente montou, como o navegador o envia.
 *
 * Só códigos e uma quantidade — nenhum preço. O valor **não** viaja daqui de
 * propósito: quem calcula é o motor, no servidor, sobre a tabela publicada do
 * Profissional. Aceitar um número do navegador seria deixar o cliente escolher
 * por quanto o profissional aparece querendo atender.
 *
 * Os códigos são conferidos contra a grade real logo depois, pelo próprio
 * motor, que recusa resposta desconhecida. Aqui só se garante forma e tamanho —
 * o suficiente para que nada absurdo chegue perto do banco.
 */
const codigo = z.string().trim().min(1).max(40)

export const InteresseNaSimulacaoSchema = z.object({
  prestadorId: z.string().uuid('Profissional inválido.'),
  respostas: z.object({
    regime: codigo,
    atividades: z.array(codigo).min(1).max(10),
    funcionarios: z.coerce.number().int().min(0).max(100_000),
    notasFiscais: codigo,
    emissor: codigo,
    faturamento: codigo,
    atendimento: codigo,
    rotina: codigo,
    adicionais: z.array(codigo).max(20).default([]),
  }),
})

export type InteresseNaSimulacaoDTO = z.input<typeof InteresseNaSimulacaoSchema>
