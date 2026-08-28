/**
 * O ciclo pós-agendamento: cancelar e remarcar.
 *
 * ## Por que os prazos moram aqui
 *
 * Porque cada um deles aparece em pelo menos quatro lugares — a decisão do
 * servidor ao cancelar, a decisão ao remarcar, o botão que a tela desenha e a
 * frase que explica a recusa. Espalhados, a tela promete o que o servidor
 * recusa; juntos, mudar a política é mudar um número.
 */

export const STATUS_AGENDAMENTO = ['agendada', 'cancelada', 'concluida'] as const
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number]

/**
 * O Cliente tem 2 horas de antecedência; o Profissional, até começar.
 *
 * Não é privilégio: é a assimetria real do compromisso. O Profissional reservou
 * uma faixa da agenda dele e é quem sofre um imprevisto de última hora — se ele
 * não puder desmarcar às 13h50 uma consulta das 14h, a alternativa não é a
 * consulta acontecer, é o Cliente esperando sozinho numa sala vazia. O Cliente,
 * do outro lado, tem a antecedência justamente para que o horário liberado
 * ainda possa ser vendido a outra pessoa.
 *
 * As duas ações usam os mesmos prazos de propósito: quem pode desmarcar pode
 * remarcar, e dois números diferentes só criariam o caso absurdo de alguém
 * poder cancelar mas não poder mudar de horário.
 */
export const ANTECEDENCIA_CLIENTE_MINUTOS = 120

/** O Profissional decide até o instante do início. Depois, não. */
export const ANTECEDENCIA_PRESTADOR_MINUTOS = 0

export const LIMITE_MOTIVO_CANCELAMENTO = 500

export const PAPEIS_DO_CICLO = ['cliente', 'prestador'] as const
export type PapelDoCiclo = (typeof PAPEIS_DO_CICLO)[number]

export const ANTECEDENCIA_POR_PAPEL: Record<PapelDoCiclo, number> = {
  cliente: ANTECEDENCIA_CLIENTE_MINUTOS,
  prestador: ANTECEDENCIA_PRESTADOR_MINUTOS,
}

export const ACAO_CANCELAR = 'Cancelar consultoria'
export const ACAO_REMARCAR = 'Remarcar'

export const MENSAGEM_PRAZO_CLIENTE =
  'O cancelamento e a remarcação podem ser feitos até 2 horas antes do horário marcado. Fale com o profissional pelo atendimento.'

export const MENSAGEM_PRAZO_PRESTADOR =
  'Esta consultoria já começou e não pode mais ser alterada por aqui.'

export const MENSAGEM_PRAZO_POR_PAPEL: Record<PapelDoCiclo, string> = {
  cliente: MENSAGEM_PRAZO_CLIENTE,
  prestador: MENSAGEM_PRAZO_PRESTADOR,
}

export const MENSAGEM_JA_CANCELADA = 'Esta consultoria já foi cancelada.'

export const MENSAGEM_SEM_ACESSO_AO_CICLO =
  'Esta consultoria não está disponível para a sua conta.'

export const MENSAGEM_MOTIVO_OBRIGATORIO =
  'Explique o motivo para o cliente. Ele verá esta mensagem no atendimento.'

/**
 * O que a tela diz sobre o dinheiro quando a consultoria é cancelada.
 *
 * O pagamento é simulado e continua registrado: não há estorno porque não houve
 * cobrança. Dizer isso em voz alta é melhor do que silenciar — silêncio, aqui,
 * seria lido como "meu dinheiro sumiu".
 */
export const AVISO_PAGAMENTO_NO_CANCELAMENTO =
  'Pagamento simulado registrado. Cancelamento sem processamento de reembolso nesta versão.'

export const AVISO_HORARIO_LIBERADO =
  'O horário voltará a ficar disponível na agenda do profissional.'

/**
 * A conclusão da consultoria.
 *
 * Só o Profissional responsável, só depois do fim contratado, só uma vez. O
 * horário ter passado **não** conclui nada por conta própria: uma consulta pode
 * simplesmente não ter acontecido, e deduzir a conclusão do relógio inventaria
 * um atendimento prestado que ninguém prestou.
 */
export const ACAO_CONCLUIR = 'Concluir consultoria'

export const MENSAGEM_AINDA_NAO_TERMINOU =
  'A consultoria só pode ser concluída depois do horário de término.'

export const MENSAGEM_JA_CONCLUIDA = 'Esta consultoria já foi concluída.'

export const MENSAGEM_CANCELADA_NAO_CONCLUI =
  'Uma consultoria cancelada não pode ser concluída.'

export const MENSAGEM_SO_O_PROFISSIONAL_CONCLUI =
  'Somente o profissional responsável pode concluir a consultoria.'

export const AVISO_DA_CONCLUSAO =
  'Isto encerra o ciclo desta consultoria. O atendimento, o protocolo e todo o histórico continuam disponíveis, e o cliente poderá avaliar o atendimento.'
