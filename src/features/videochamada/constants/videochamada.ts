/**
 * A janela de acesso da videochamada da Consultoria.
 *
 * ## Por que a janela existe
 *
 * Porque uma sala aberta para sempre é uma sala que não é de ninguém. O que foi
 * contratado é um encontro com hora marcada; o acesso acompanha o encontro, e
 * não a existência do protocolo. Isso também é o que impede os minutos do plano
 * de serem consumidos fora da consulta.
 *
 * ## Por que os números moram aqui
 *
 * Estes dois números aparecem em quatro lugares — a decisão do servidor, a
 * expiração da sala na Daily, a expiração do token e o texto que a tela mostra.
 * Espalhá-los faria a tela prometer um horário que o servidor recusa.
 */

/** Entrada liberada 10 minutos antes do início. */
export const MINUTOS_ANTES_DA_CONSULTORIA = 10

/** Tolerância depois do fim: 15 minutos. Depois disso, ninguém entra. */
export const MINUTOS_DE_TOLERANCIA = 15

/**
 * Os três estados possíveis da janela.
 *
 * Não há um quarto para "em andamento": do ponto de vista do acesso, faltar
 * cinco minutos e estar no meio da consulta são a mesma coisa — entra.
 */
export const SITUACOES_DA_JANELA = ['antes', 'aberta', 'encerrada'] as const
export type SituacaoDaJanela = (typeof SITUACOES_DA_JANELA)[number]

export const TITULO_VIDEOCHAMADA = 'Videochamada'

export const MENSAGENS_DA_JANELA: Record<SituacaoDaJanela, string> = {
  antes: `Disponível a partir de ${MINUTOS_ANTES_DA_CONSULTORIA} minutos antes da consultoria.`,
  aberta: 'Sua videochamada está disponível.',
  encerrada: 'A janela desta videochamada foi encerrada.',
}

export const ACAO_ENTRAR = 'Entrar na videochamada'
export const ACAO_SAIR = 'Sair da videochamada'

/**
 * O que o usuário lê quando a Daily falha.
 *
 * Uma frase só, sem código, sem corpo de resposta, sem nome de fornecedor.
 * Quem precisa do detalhe é o log do servidor — e lá ele chega sanitizado.
 */
export const MENSAGEM_FALHA_VIDEOCHAMADA =
  'Não foi possível iniciar a videochamada agora. Tente novamente em alguns instantes.'

/** Recusa de participação. Deliberadamente igual para "não é sua" e "não existe". */
export const MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA =
  'Esta videochamada não está disponível para a sua conta.'

export const MENSAGEM_SESSAO_NECESSARIA =
  'Entre na sua conta para acessar a videochamada.'
