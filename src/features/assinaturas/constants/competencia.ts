import type { Periodicidade } from './assinatura'

/**
 * O ciclo de vida de um mês de prestação.
 *
 * `prevista` é o mês que o contrato cobre mas que ainda não começou — o estado
 * em que toda competência nasce, e o único que esta fatia produz ao contratar.
 * `em_andamento` e `cumprida` dependem de a prestação ter começado de verdade,
 * o que só existe depois do pagamento; `cancelada` é o mês que deixou de ser
 * devido porque o contrato acabou antes dele.
 *
 * Não há `paga` aqui, de propósito. Pagamento terá entidade própria, e esta
 * tabela dizendo também se algo foi pago seria um segundo lugar com a mesma
 * verdade financeira — o tipo de duplicidade que acaba discordando.
 */
export const STATUS_COMPETENCIA = [
  'prevista',
  'em_andamento',
  'cumprida',
  'cancelada',
] as const
export type StatusCompetencia = (typeof STATUS_COMPETENCIA)[number]

export const ROTULO_STATUS_COMPETENCIA: Record<StatusCompetencia, string> = {
  prevista: 'Prevista',
  em_andamento: 'Em andamento',
  cumprida: 'Cumprida',
  cancelada: 'Cancelada',
}

/**
 * Os estados em que o mês ainda não foi prestado — e que o cancelamento pode,
 * portanto, encerrar. Mês em andamento ou cumprido é histórico: não se apaga.
 */
export const STATUS_NAO_PRESTADOS: StatusCompetencia[] = ['prevista']

/**
 * Quantas competências nascem com o contrato.
 *
 * Prazo fechado (6 ou 12 meses) conhece a própria duração: todas as
 * competências existem desde a contratação, previstas. O mensal é contínuo —
 * não tem duração para prever, e inventar um horizonte (100, 120 meses)
 * afirmaria um fim que ninguém contratou. Nasce só a primeira; as seguintes são
 * materializadas uma de cada vez, quando houver o motor financeiro que as
 * justifique.
 */
export function competenciasNaContratacao(
  periodicidade: Periodicidade,
  meses: number,
): number {
  return periodicidade === 'mensal' ? 1 : meses
}
