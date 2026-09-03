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
  avaliacaoRecebida: 'avaliacao_recebida',
  ajusteSolicitado: 'ajuste_solicitado',
  ajusteAnalisado: 'ajuste_analisado',
  prazoProximo: 'prazo_proximo',
  // Colaboração
  conviteRecebido: 'convite_recebido',
  mensagemNegociacao: 'mensagem_negociacao',
  contrapropostaRecebida: 'contraproposta_recebida',
  propostaAtualizada: 'proposta_atualizada',
  conviteAceito: 'convite_aceito',
  conviteRecusado: 'convite_recusado',
  conviteCancelado: 'convite_cancelado',
  // Oportunidades — etapa anterior à contratação.
  oportunidadeDisponivel: 'oportunidade_disponivel',
  /**
   * Solicitação de orçamento dirigida a **um** Profissional.
   *
   * Tipo próprio, e não o `oportunidade_disponivel` de sempre, porque o que a
   * pessoa precisa entender ao ler o sino é diferente: não é "apareceu trabalho
   * na sua área", é "alguém escolheu você". O destino, o recurso e a
   * idempotência continuam sendo os mesmos da oportunidade pública.
   */
  oportunidadeDireta: 'oportunidade_direta',
  /** O destinatário de uma solicitação direta dispensou o convite ao orçamento. */
  oportunidadeSemInteresse: 'oportunidade_sem_interesse',
  /**
   * O Profissional escolhido respondeu à solicitação dirigida a ele.
   *
   * Só existe no fluxo **privado**, pela mesma assimetria de
   * `oportunidade_sem_interesse`: na pública o Cliente espera várias respostas e
   * o sino viraria um contador de propostas; na privada existe **uma** pessoa, e
   * a resposta dela é exatamente o que ele está esperando para seguir. Nada muda
   * na oportunidade pública, que continua avisando só em tempo real.
   */
  oportunidadeRespondida: 'oportunidade_respondida',
  /**
   * O prazo da solicitação acabou sem acordo.
   *
   * Emitida pelo agendador, e por mais ninguém: é o único aviso da plataforma
   * cujo fato gerador é o relógio e não uma pessoa. Vai para quem tem o que
   * perder com o silêncio — o Cliente dono e quem chegou a enviar proposta.
   */
  oportunidadeExpirada: 'oportunidade_expirada',
  contrapropostaOportunidade: 'contraproposta_oportunidade',
  contrapropostaAceita: 'contraproposta_oportunidade_aceita',
  contrapropostaRecusada: 'contraproposta_oportunidade_recusada',
  propostaAceita: 'proposta_oportunidade_aceita',
  pagamentoAprovado: 'pagamento_oportunidade_aprovado',
  atendimentoCriadoDaOportunidade: 'atendimento_criado_da_oportunidade',
  /**
   * Consultoria Agendada — a terceira porta de entrada do Atendimento.
   *
   * Só o Profissional é avisado, e por regra da casa: `emitirNotificacoes`
   * descarta o autor, e quem paga é o Cliente. Ele já vê a confirmação com o
   * protocolo na tela; quem precisa ser puxado de volta à plataforma é quem
   * ganhou hora marcada sem estar olhando.
   */
  consultoriaAgendada: 'consultoria_agendada',
  /**
   * Consultoria Agendada: o compromisso mudou de horário ou deixou de existir.
   *
   * Tipos próprios porque o que a pessoa precisa entender ao ler o sino é
   * específico — há uma data no aviso, e ela é a informação principal.
   * `status_alterado`, que é o tipo genérico do Atendimento, diria "algo mudou"
   * sobre a única coisa cujo detalhe importa.
   */
  consultoriaCancelada: 'consultoria_cancelada',
  consultoriaRemarcada: 'consultoria_remarcada',
  /**
   * O aviso de que a consulta está chegando.
   *
   * Um tipo só para as três antecedências (24h, 1h, 10min): do ponto de vista
   * de quem lê o sino é sempre o mesmo assunto — "sua consultoria está
   * próxima" —, e o que distingue os três é o texto e a chave de dedupe, não a
   * natureza do aviso. Três tipos obrigariam toda tela e todo filtro a
   * conhecer os três para tratá-los igual.
   */
  consultoriaLembrete: 'consultoria_lembrete',
  consultoriaConcluida: 'consultoria_concluida',
} as const

export type TipoNotificacao =
  (typeof TIPOS_NOTIFICACAO)[keyof typeof TIPOS_NOTIFICACAO]

export const RECURSOS_NOTIFICACAO = [
  'atendimento',
  'convite',
  'oportunidade',
] as const
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
  [TIPOS_NOTIFICACAO.avaliacaoRecebida]: '⭐',
  [TIPOS_NOTIFICACAO.ajusteSolicitado]: '🔧',
  [TIPOS_NOTIFICACAO.ajusteAnalisado]: '🔧',
  [TIPOS_NOTIFICACAO.prazoProximo]: '⏰',
  [TIPOS_NOTIFICACAO.oportunidadeRespondida]: '🤝',
  [TIPOS_NOTIFICACAO.consultoriaCancelada]: '🚫',
  [TIPOS_NOTIFICACAO.consultoriaRemarcada]: '📅',
  [TIPOS_NOTIFICACAO.consultoriaLembrete]: '⏰',
  [TIPOS_NOTIFICACAO.consultoriaConcluida]: '✅',
  [TIPOS_NOTIFICACAO.conviteRecebido]: '🤝',
  [TIPOS_NOTIFICACAO.mensagemNegociacao]: '💬',
  [TIPOS_NOTIFICACAO.contrapropostaRecebida]: '💰',
  [TIPOS_NOTIFICACAO.propostaAtualizada]: '💰',
  [TIPOS_NOTIFICACAO.conviteAceito]: '✅',
  [TIPOS_NOTIFICACAO.conviteRecusado]: '🚫',
  [TIPOS_NOTIFICACAO.conviteCancelado]: '🚫',
  [TIPOS_NOTIFICACAO.oportunidadeDisponivel]: '🎯',
  [TIPOS_NOTIFICACAO.oportunidadeDireta]: '🎯',
  [TIPOS_NOTIFICACAO.oportunidadeSemInteresse]: '🚫',
  [TIPOS_NOTIFICACAO.oportunidadeExpirada]: '⏰',
  [TIPOS_NOTIFICACAO.contrapropostaOportunidade]: '💰',
  [TIPOS_NOTIFICACAO.contrapropostaAceita]: '🤝',
  [TIPOS_NOTIFICACAO.contrapropostaRecusada]: '↩️',
  [TIPOS_NOTIFICACAO.propostaAceita]: '🤝',
  [TIPOS_NOTIFICACAO.pagamentoAprovado]: '💳',
  [TIPOS_NOTIFICACAO.atendimentoCriadoDaOportunidade]: '📋',
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
  pagina: 'atendimentos' | 'dashboard' | 'oportunidades'
  /** Protocolo (`#AAAA-NNNN`) ou id — o que o deep-link do quadro aceita. */
  atendimento?: string
  aba?: 'protocolo' | 'conversa' | 'arquivos' | 'historico' | 'info'
  canal?: 'cliente' | 'interno'
  /** Abre direto a negociação daquele convite. */
  conviteId?: string
  /** Abre a lista de Oportunidades já destacando esta. */
  oportunidadeId?: string
}

/** Teto da caixa carregada de uma vez: o sino é uma fila, não um arquivo. */
export const LIMITE_NOTIFICACOES_CARREGADAS = 30
