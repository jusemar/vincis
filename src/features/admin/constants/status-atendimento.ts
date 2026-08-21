import type { Status } from '../types/atendimentos'

/**
 * Identidade visual dos status — fonte única.
 *
 * O mesmo status precisa ter a mesma cara em todo lugar: a bolinha da coluna do
 * Kanban, o badge do card, a célula da Lista e o cabeçalho do painel. Antes cada
 * um desses lugares repetia as classes por conta própria, e bastava esquecer um
 * para "Novo" aparecer azul num canto e cinza no outro.
 *
 * As cores são exatamente as já aprovadas — este arquivo só reúne o que estava
 * espalhado, sem trocar nenhuma delas.
 */
export const IDENTIDADE_STATUS: Record<
  Status,
  { rotulo: string; ponto: string; badge: string; tom: string }
> = {
  novo: {
    rotulo: 'Novo',
    ponto: 'bg-status-new',
    badge: 'bg-status-new-bg text-status-new',
    tom: 'new',
  },
  andamento: {
    rotulo: 'Em andamento',
    ponto: 'bg-status-progress',
    badge: 'bg-status-progress-bg text-status-progress',
    tom: 'progress',
  },
  'aguardando-cliente': {
    rotulo: 'Aguardando cliente',
    ponto: 'bg-status-waiting',
    badge: 'bg-status-waiting-bg text-status-waiting',
    tom: 'waiting',
  },
  'aguardando-assinatura': {
    rotulo: 'Aguardando assinatura',
    ponto: 'bg-status-sign',
    badge: 'bg-status-sign-bg text-status-sign',
    tom: 'sign',
  },
  concluido: {
    rotulo: 'Concluído',
    ponto: 'bg-status-done',
    badge: 'bg-status-done-bg text-status-done',
    tom: 'done',
  },
  // Encerramentos excepcionais: neutros, para não competir com o fluxo normal.
  recusado: {
    rotulo: 'Recusado',
    ponto: 'bg-priority-high',
    badge: 'bg-rose-50 text-priority-high',
    tom: 'high',
  },
  cancelado: {
    rotulo: 'Cancelado',
    ponto: 'bg-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    tom: 'neutral',
  },
}

/** Rótulo do status, do mesmo lugar de onde vem a cor. */
export const rotuloDoStatus = (status: Status) => IDENTIDADE_STATUS[status].rotulo
