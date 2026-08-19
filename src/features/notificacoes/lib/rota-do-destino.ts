import type { DestinoNotificacao } from '../constants/notificacao'

/**
 * Destino guardado → rota do painel.
 *
 * A montagem vive aqui porque três lugares precisam dela: o clique no sino, o
 * clique no toast do tempo real e qualquer link futuro. Duplicar a string
 * significaria três formatos de URL divergindo com o tempo — e um deles
 * abrindo a tela sem selecionar nada, que é o pior tipo de link quebrado
 * porque parece funcionar.
 *
 * A rota é só endereço: a tela de chegada continua autorizando o acesso por
 * conta própria. Nenhum link contorna permissão.
 */
export function rotaDoDestino(destino: DestinoNotificacao) {
  const parametros = new URLSearchParams({ pagina: destino.pagina })
  if (destino.atendimento) parametros.set('atendimento', destino.atendimento)
  if (destino.aba) parametros.set('aba', destino.aba)
  if (destino.canal) parametros.set('canal', destino.canal)
  if (destino.conviteId) parametros.set('convite', destino.conviteId)
  return `/admin?${parametros.toString()}`
}
