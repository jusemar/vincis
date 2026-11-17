import { PADRAO_IDENTIFICADOR } from '../../nucleo/lib/identificador'
import type { StatusPagina } from '../../nucleo/types'
import { slugReservadoVincis } from '../rotas-reservadas'
import { rotaInternaPermitida, type TipoDestinoCardHome } from './constantes'

/**
 * Endereço público de um card, ou `null` quando o destino não está no ar.
 *
 * Regra única para a Home e para a Gestão (que mostra o aviso):
 * - página do CMS: só publicada, e com slug válido que não colida com rota real;
 *   rascunho e arquivada tiram o card do site até o Gestor corrigir;
 * - rota interna: só se ainda estiver no catálogo — uma rota retirada do
 *   catálogo não continua sendo servida por um registro antigo.
 */
export function resolverDestinoCardHome(card: {
  destinoTipo: TipoDestinoCardHome
  rota: string | null
  paginaSlug: string | null
  paginaStatus: StatusPagina | null
}): string | null {
  if (card.destinoTipo === 'rota') return card.rota && rotaInternaPermitida(card.rota) ? card.rota : null
  if (card.paginaStatus !== 'publicada' || !card.paginaSlug) return null
  if (!PADRAO_IDENTIFICADOR.test(card.paginaSlug) || slugReservadoVincis(card.paginaSlug)) return null
  return `/${card.paginaSlug}`
}
