/**
 * Vocabulário da contratação da Consultoria Agendada.
 *
 * A trilha vive aqui — e não dentro do modal — porque ela é contrato de
 * produto, não decoração: são **três** etapas, sempre as mesmas três. Entrar
 * ou criar conta não é etapa; é um desvio dentro de "Detalhes", e quem estiver
 * autenticando continua conceitualmente no primeiro passo. Deixar a lista
 * numa constante impede que a próxima etapa insira um "Login" no meio sem
 * ninguém perceber.
 */

export const PASSOS_CONTRATACAO = [
  { rotulo: 'Detalhes' },
  { rotulo: 'Pagamento' },
  { rotulo: 'Concluído' },
] as const

/** Índice de cada etapa na trilha. Detalhes é o único que esta etapa alcança. */
export const PASSO_DETALHES = 0
export const PASSO_PAGAMENTO = 1
export const PASSO_CONCLUIDO = 2

/**
 * Teto do campo "O que você deseja tratar na consultoria?".
 *
 * Mil caracteres é o suficiente para o Profissional se preparar sem que o
 * campo vire petição. O mesmo número alimenta o contador da tela e o `max` do
 * schema: dois limites diferentes para o mesmo campo produzem um contador que
 * diz "ok" e um servidor que recusa.
 */
export const LIMITE_DESCRICAO_CONSULTORIA = 1_000

/**
 * O texto que o Cliente vê quando o horário escapou.
 *
 * Fica numa constante porque aparece em dois lugares — a resposta do servidor
 * e o aviso do modal — e porque ele não pode virar erro técnico: quem perdeu o
 * horário precisa de instrução ("escolha outro"), não de diagnóstico.
 */
export const MENSAGEM_HORARIO_INDISPONIVEL =
  'Este horário não está mais disponível. Escolha outro horário.'

/** Rótulo único da ação principal do modal. */
export const ACAO_CONTINUAR = 'Continuar para pagamento'

/**
 * Para onde leva o botão do sucesso.
 *
 * A Área do Cliente navega por query (`?aba=…&atendimento=…`) — é o mesmo
 * deep-link que o sino já usa para abrir um Atendimento. Montar a URL aqui, e
 * numa função só, evita que a próxima tela invente um `/atendimentos/:id` que
 * não existe.
 */
export function rotaDoAtendimento(protocolo: string): string {
  return `/cliente?aba=atendimentos&atendimento=${encodeURIComponent(protocolo)}`
}

/**
 * O mesmo destino, do lado do Profissional.
 *
 * O painel dele navega por `?pagina=…&atendimento=…` — outro roteamento, mesmo
 * princípio: o deep-link já existe e é o que o sino usa. As duas rotas ficam
 * lado a lado aqui para que ninguém precise lembrar qual área usa qual query.
 */
export function rotaDoAtendimentoNoPainel(protocolo: string): string {
  return `/admin?pagina=atendimentos&atendimento=${encodeURIComponent(protocolo)}`
}

export const ACAO_VER_ATENDIMENTO = 'Ver meu atendimento'
export const TITULO_CONSULTORIA_CONFIRMADA = 'Consultoria agendada!'
