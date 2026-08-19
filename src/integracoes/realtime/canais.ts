/**
 * Nomes dos canais de tempo real.
 *
 * Todos começam com `private-`: no Pusher esse prefixo é o que obriga o
 * navegador a pedir autorização ao servidor antes de assinar. Canal público não
 * é usado em lugar nenhum desta aplicação — não há evento aqui que possa ser
 * lido por quem passar na rua.
 *
 * Três escopos, e o motivo de cada um:
 *
 * - **usuário**: a fila pessoal. Notificação, toast e contadores. Ninguém além
 *   do dono assina.
 * - **atendimento**: quem está com o protocolo aberto recebe "mudou" e refaz a
 *   consulta. Assinam os que têm vínculo com aquele Atendimento.
 * - **convite**: a negociação privada entre duas pessoas. Assinam as duas
 *   pontas, e mais ninguém — nem o resto da equipe do Atendimento.
 */

export function canalDoUsuario(usuarioId: string) {
  return `private-usuario-${usuarioId}`
}

export function canalDoAtendimento(atendimentoId: string) {
  return `private-atendimento-${atendimentoId}`
}

export function canalDoConvite(conviteId: string) {
  return `private-convite-${conviteId}`
}

export type EscopoCanal = 'usuario' | 'atendimento' | 'convite'

export type CanalIdentificado = { escopo: EscopoCanal; id: string }

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Interpreta o nome que o navegador pediu para assinar.
 *
 * Devolve `null` para qualquer coisa fora do formato — inclusive para canais
 * públicos e para ids que não são uuid. O servidor decide se autoriza olhando o
 * escopo e o id **conferidos aqui**, e nunca um nome de canal solto.
 */
export function interpretarCanal(nome: string): CanalIdentificado | null {
  const partes = /^private-(usuario|atendimento|convite)-(.+)$/.exec(nome)
  if (!partes) return null

  const [, escopo, id] = partes
  if (!UUID.test(id)) return null

  return { escopo: escopo as EscopoCanal, id }
}
