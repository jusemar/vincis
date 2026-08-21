import { z } from 'zod'
import { converterValorParaCentavos } from '@/features/oportunidades/schemas/oportunidade'

/**
 * O que a simulação de pagamento recebe.
 *
 * Dois campos, e o segundo é a exceção documentada: `valorAcordado` só é lido
 * quando o acordo fechou **sem** valor ("a combinar"). Quando existe valor
 * acordado, ele vem do banco e o que o navegador mandar é ignorado — deixar o
 * Cliente escolher quanto paga por um preço já combinado seria a forma mais
 * óbvia de burlar o acordo.
 *
 * Nenhum campo de meio de pagamento entra aqui, hoje ou nesta etapa: não há
 * cartão, CVV, titular, bandeira, parcelas nem chave PIX. A simulação não
 * coleta isso, e por isso não existe onde esses dados caberiam.
 */
export const PagamentoSimuladoSchema = z.object({
  oportunidadeId: z.string().uuid('Solicitação inválida.'),
  /**
   * Valor informado pelo Cliente **apenas** quando o acordo ficou "a combinar".
   *
   * Provisório e explícito: o fluxo real de definição de preço ainda não
   * existe, e sem um número não há o que simular. Texto livre em reais,
   * convertido em centavos no servidor pela mesma função das demais telas.
   */
  valorAcordado: z.string().trim().max(20).optional().default(''),
})

export { converterValorParaCentavos }
