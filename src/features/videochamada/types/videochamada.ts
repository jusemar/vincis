import type { SituacaoDaJanela } from '../constants/videochamada'

/**
 * O que a tela sabe sobre a videochamada **antes** de alguém clicar.
 *
 * Só horários e identificadores — nada que sirva para entrar. Ele viaja junto
 * do Atendimento para a tela poder dizer "abre às 14:20" sem uma segunda
 * requisição, e é por isso que não contém URL nem token: desenhar o botão e
 * autorizar a entrada são decisões diferentes, tomadas em momentos diferentes,
 * e só a segunda vale.
 */
export type ConsultoriaDoAtendimentoDTO = {
  agendamentoId: string
  /** ISO. Instantes absolutos: quem formata é a tela, no fuso de baixo. */
  inicioEm: string
  fimEm: string
  /** O fuso contratado — para escrever "14:30", nunca para decidir acesso. */
  timezone: string
  duracaoMinutos: number
  /** Quando a entrada libera e quando fecha. Já calculados no servidor. */
  janelaAbreEm: string
  janelaFechaEm: string
}

/**
 * A resposta do clique em "Entrar na videochamada".
 *
 * `autorizado` é o único desfecho que carrega credencial, e ela é de uso único
 * e imediato: o token acompanha esta resposta, entra no `join()` e morre com a
 * aba. Ele não é gravado, não volta ao servidor e não aparece na URL.
 */
export type ResultadoDeEntrada =
  | {
      situacao: 'autorizado'
      /** URL da sala privada. Sozinha, não abre nada. */
      url: string
      /** Token temporário, limitado a esta sala e a este participante. */
      token: string
      /** Só para o cabeçalho Vincis ao redor da chamada. */
      nomeExibido: string
      /** Quando o acesso expira — a tela usa para avisar antes de a Daily cortar. */
      expiraEm: string
    }
  | { situacao: 'fora_da_janela'; janela: SituacaoDaJanela; mensagem: string }
  | { situacao: 'sem_acesso'; mensagem: string }
  | { situacao: 'sem_sessao'; mensagem: string }
  | { situacao: 'falha'; mensagem: string }
