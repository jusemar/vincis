/**
 * Vocabulário das notificações.
 *
 * Notificação é aviso dirigido a uma pessoa — distinto do evento do Atendimento
 * (registro permanente, sem dono) e da lista de Atividades recentes (resumo do
 * que andou acontecendo). Os três podem nascer do mesmo fato; só este tem
 * destinatário e estado de leitura.
 */

export const TIPOS_NOTIFICACAO = {
  // Atendimento
  mensagemConversa: 'mensagem_conversa',
  clienteRespondeu: 'cliente_respondeu',
  manifestacaoProtocolo: 'manifestacao_protocolo',
  arquivoRecebido: 'arquivo_recebido',
  statusAlterado: 'status_alterado',
  atendimentoConcluido: 'atendimento_concluido',
  prazoProximo: 'prazo_proximo',
  // Colaboração
  conviteRecebido: 'convite_recebido',
  mensagemNegociacao: 'mensagem_negociacao',
  contrapropostaRecebida: 'contraproposta_recebida',
  propostaAtualizada: 'proposta_atualizada',
  conviteAceito: 'convite_aceito',
  conviteRecusado: 'convite_recusado',
  conviteCancelado: 'convite_cancelado',
} as const

export type TipoNotificacao =
  (typeof TIPOS_NOTIFICACAO)[keyof typeof TIPOS_NOTIFICACAO]

export const RECURSOS_NOTIFICACAO = ['atendimento', 'convite'] as const
export type RecursoNotificacao = (typeof RECURSOS_NOTIFICACAO)[number]

/**
 * Ícone de cada tipo.
 *
 * São os mesmos emojis que o dropdown mockado do sino já usa — a notificação
 * real precisa parecer com as que estão lá, não com uma família nova de
 * ícones. Tipo sem entrada cai no genérico em vez de sumir.
 */
export const ICONE_NOTIFICACAO: Record<string, string> = {
  [TIPOS_NOTIFICACAO.mensagemConversa]: '💬',
  [TIPOS_NOTIFICACAO.clienteRespondeu]: '💬',
  [TIPOS_NOTIFICACAO.manifestacaoProtocolo]: '📋',
  [TIPOS_NOTIFICACAO.arquivoRecebido]: '📎',
  [TIPOS_NOTIFICACAO.statusAlterado]: '🔄',
  [TIPOS_NOTIFICACAO.atendimentoConcluido]: '✅',
  [TIPOS_NOTIFICACAO.prazoProximo]: '⏰',
  [TIPOS_NOTIFICACAO.conviteRecebido]: '🤝',
  [TIPOS_NOTIFICACAO.mensagemNegociacao]: '💬',
  [TIPOS_NOTIFICACAO.contrapropostaRecebida]: '💰',
  [TIPOS_NOTIFICACAO.propostaAtualizada]: '💰',
  [TIPOS_NOTIFICACAO.conviteAceito]: '✅',
  [TIPOS_NOTIFICACAO.conviteRecusado]: '🚫',
  [TIPOS_NOTIFICACAO.conviteCancelado]: '🚫',
}

export function iconeDaNotificacao(tipo: string) {
  return ICONE_NOTIFICACAO[tipo] ?? '🔔'
}

/**
 * Para onde o clique leva.
 *
 * Guardado em partes, e não como URL pronta: a tela do `/admin` navega por
 * `?pagina=…&atendimento=…`, e montar essa string no domínio amarraria o
 * backend ao roteamento do painel. `aba` e `canal` são o que faz a notificação
 * cair na Conversa certa em vez de só abrir o Atendimento.
 */
export type DestinoNotificacao = {
  pagina: 'atendimentos' | 'dashboard'
  /** Protocolo (`#AAAA-NNNN`) ou id — o que o deep-link do quadro aceita. */
  atendimento?: string
  aba?: 'protocolo' | 'conversa' | 'arquivos' | 'historico' | 'info'
  canal?: 'cliente' | 'interno'
  /** Abre direto a negociação daquele convite. */
  conviteId?: string
}

/** Teto da caixa carregada de uma vez: o sino é uma fila, não um arquivo. */
export const LIMITE_NOTIFICACOES_CARREGADAS = 30
