/**
 * As etapas visuais da contratação paga de um serviço.
 *
 * Duas, e não três: depois do Pix confirmado, o próprio cartão "Serviço
 * contratado!" (com protocolo e "Ver meu atendimento") é a confirmação final —
 * um terceiro passo "Concluído" repetia a mesma informação. Confirmado o
 * pagamento, a trilha mostra as duas etapas concluídas (`PASSO_SERVICO_FINALIZADO`).
 *
 * A Consultoria Agendada mantém a trilha de três passos dela.
 */
export const PASSOS_CONTRATACAO_SERVICO = [
  { rotulo: 'Detalhes' },
  { rotulo: 'Pagamento' },
] as const

export const PASSO_SERVICO_DETALHES = 0
export const PASSO_SERVICO_PAGAMENTO = 1
/** Além do último índice: todas as etapas aparecem concluídas. */
export const PASSO_SERVICO_FINALIZADO = PASSOS_CONTRATACAO_SERVICO.length
