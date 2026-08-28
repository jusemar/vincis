/**
 * Vocabulário e prazo da reserva temporária.
 *
 * O número dos dez minutos vive aqui e em nenhum outro lugar: é decisão de
 * produto, e espalhá-la por componente e action produziria uma tela que promete
 * dez minutos enquanto o servidor conta cinco.
 */

/** Quanto tempo o horário fica preso ao Cliente que o reservou. */
export const HOLD_CONSULTORIA_MINUTOS = 10

/**
 * Estados de uma reserva.
 *
 * - `ativa`: pode estar valendo — depende de `expira_em` ainda estar no futuro;
 * - `expirada`: o prazo venceu e a varredura de aquisição já marcou;
 * - `liberada`: o próprio Cliente trocou de horário e abriu mão desta;
 * - `confirmada`: virou consultoria contratada e não volta atrás.
 *
 * `ativa` é candidatura, não garantia: quem decide se a reserva ainda segura o
 * horário é sempre `status = 'ativa' AND expira_em > agora`, nunca o status
 * sozinho.
 *
 * `confirmada` é terminal e **não** é o que bloqueia o horário dali em diante —
 * quem bloqueia é o `consultoria_agendamentos` correspondente. Fosse o status
 * da reserva, o horário voltaria à venda no minuto em que o prazo dela vencesse,
 * mesmo com a consultoria paga.
 */
export const STATUS_RESERVA = [
  'ativa',
  'expirada',
  'liberada',
  'confirmada',
] as const
export type StatusReserva = (typeof STATUS_RESERVA)[number]

/** Mensagem pública de reserva vencida. Não renova nada — só orienta. */
export const MENSAGEM_RESERVA_EXPIRADA =
  'Sua reserva temporária expirou. Escolha um novo horário.'

/**
 * O texto que o Cliente vê quando a reserva está de pé.
 *
 * Fala em "até" de propósito: a reserva não garante dez minutos cheios se a
 * pessoa demorar a chegar aqui — garante até o instante gravado em `expira_em`.
 */
export const TITULO_RESERVA_ATIVA = 'Horário reservado temporariamente.'
export const DETALHE_RESERVA_ATIVA = `Seu horário está reservado por até ${HOLD_CONSULTORIA_MINUTOS} minutos enquanto você conclui a contratação.`
