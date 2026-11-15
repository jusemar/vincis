/**
 * Mensalidade do plano contábil mensal da Vincis.
 *
 * "Plano ativo" e "mensalidade em dia" são fatos diferentes: o plano continua
 * ativo (cadastrado, com o mesmo contador) mesmo quando um mês está em aberto.
 * Estas constantes falam só do dinheiro de cada mês.
 */

/**
 * Quantos dias antes do início do período a mensalidade fica disponível.
 *
 * A competência do mês seguinte nasce nessa janela — nem antes (sem horizonte
 * artificial de meses futuros), nem depois (o cliente precisa poder pagar até
 * o vencimento).
 */
export const DIAS_ANTECEDENCIA_MENSALIDADE = 7

/**
 * Teto de meses materializados de uma vez para uma assinatura.
 *
 * Proteção, não regra: a janela de antecedência já limita a criação ao mês que
 * vem. Um contrato com vigência muito antiga (a rotina parada por meses) não
 * pode virar um laço sem fim numa única execução.
 */
export const LIMITE_MESES_POR_PREPARACAO = 24

export const SITUACOES_MENSALIDADE = ['paga', 'aguardando_pagamento', 'em_atraso', 'cancelada'] as const
export type SituacaoMensalidade = (typeof SITUACOES_MENSALIDADE)[number]

export const ROTULO_SITUACAO_MENSALIDADE: Record<SituacaoMensalidade, string> = {
  paga: 'Paga',
  aguardando_pagamento: 'Aguardando pagamento',
  em_atraso: 'Em atraso',
  cancelada: 'Cancelada',
}

/** Situação financeira do plano como um todo, para listas. */
export const SITUACOES_FINANCEIRAS_DO_PLANO = ['em_dia', 'aguardando_pagamento', 'em_atraso'] as const
export type SituacaoFinanceiraDoPlano = (typeof SITUACOES_FINANCEIRAS_DO_PLANO)[number]

export const ROTULO_SITUACAO_FINANCEIRA: Record<SituacaoFinanceiraDoPlano, string> = {
  em_dia: 'Mensalidade em dia',
  aguardando_pagamento: 'Aguardando pagamento da mensalidade',
  em_atraso: 'Mensalidade em atraso',
}

/** Quantas mensalidades o histórico resumido mostra. */
export const MENSALIDADES_NO_HISTORICO = 6

/**
 * "AAAA-MM-DD" → "DD/MM/AAAA", sem passar por `Date`.
 *
 * O período do mês é data de calendário, não instante: `new Date('2026-12-12')`
 * é meia-noite UTC e, formatado em São Paulo, viraria 11/12.
 */
export function formatarDataLocal(data: string | null): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

/** "12/12 a 11/01" — o período de uma mensalidade, curto. */
export function formatarPeriodoCurto(inicio: string | null, fim: string | null): string {
  if (!inicio || !fim) return '—'
  return `${formatarDataLocal(inicio).slice(0, 5)} a ${formatarDataLocal(fim).slice(0, 5)}`
}
