import type { SituacaoEditorial, StatusPublicacao, StatusVersao } from '../constants/status'

/**
 * Regras puras do fluxo editorial — sem banco, testáveis.
 *
 * Quem pode o quê:
 * - **Autor** (profissional dono ou Gestor no institucional): edita a versão em
 *   aberto quando ela é `rascunho` ou `devolvida`; envia; cancela o envio.
 *   Num artigo publicado/despublicado sem versão em aberto, editar **abre uma
 *   revisão** (versão nova) — o texto no ar só muda quando a Vincis aprovar.
 * - **Gestão**: aprova, devolve ou rejeita a versão `aguardando_aprovacao`;
 *   despublica, republica, arquiva e destaca o artigo.
 */

export type EstadoArtigo = {
  statusPublicacao: StatusPublicacao
  /** Versão em aberto (rascunho/aguardando/devolvida), se houver. */
  versaoAberta: { status: StatusVersao } | null
  /** Status da versão mais recente (para "rejeitado" de quem nunca publicou). */
  ultimaVersao: { status: StatusVersao } | null
}

export function situacaoEditorial(estado: EstadoArtigo): SituacaoEditorial {
  if (estado.statusPublicacao === 'arquivado') return 'arquivado'
  const aberta = estado.versaoAberta?.status
  if (aberta === 'aguardando_aprovacao') return 'aguardando_aprovacao'
  if (aberta === 'devolvida') return 'devolvido'
  if (estado.statusPublicacao === 'publicado') return 'publicado'
  if (aberta === 'rascunho') return 'rascunho'
  if (estado.statusPublicacao === 'despublicado') return 'despublicado'
  if (estado.ultimaVersao?.status === 'rejeitada') return 'rejeitado'
  return 'rascunho'
}

/** O artigo publicado tem uma revisão em andamento (texto no ar preservado)? */
export function temRevisaoEmAndamento(estado: EstadoArtigo): boolean {
  return estado.statusPublicacao === 'publicado' && Boolean(estado.versaoAberta)
}

export type DecisaoEdicao =
  | { tipo: 'editar_aberta' }
  | { tipo: 'abrir_revisao' }
  | { tipo: 'bloqueado'; motivo: string }

/** O que acontece quando o autor salva o artigo. */
export function decidirEdicao(estado: EstadoArtigo): DecisaoEdicao {
  if (estado.statusPublicacao === 'arquivado')
    return { tipo: 'bloqueado', motivo: 'Artigo arquivado não pode ser editado.' }
  const aberta = estado.versaoAberta?.status
  if (aberta === 'aguardando_aprovacao')
    return {
      tipo: 'bloqueado',
      motivo: 'O artigo está em análise. Cancele o envio para voltar a editar.',
    }
  if (aberta === 'rascunho' || aberta === 'devolvida') return { tipo: 'editar_aberta' }
  if (estado.statusPublicacao === 'publicado' || estado.statusPublicacao === 'despublicado')
    return { tipo: 'abrir_revisao' }
  if (estado.ultimaVersao?.status === 'rejeitada')
    return {
      tipo: 'bloqueado',
      motivo: 'Artigo rejeitado não pode ser reenviado. Se quiser, escreva um novo artigo.',
    }
  return { tipo: 'abrir_revisao' }
}

export function podeEnviar(estado: EstadoArtigo): boolean {
  const aberta = estado.versaoAberta?.status
  return estado.statusPublicacao !== 'arquivado' && (aberta === 'rascunho' || aberta === 'devolvida')
}

export function podeCancelarEnvio(estado: EstadoArtigo): boolean {
  return estado.statusPublicacao !== 'arquivado' && estado.versaoAberta?.status === 'aguardando_aprovacao'
}

export type AcaoPublicacao = 'despublicar' | 'republicar' | 'arquivar'

const ORIGENS: Record<AcaoPublicacao, readonly StatusPublicacao[]> = {
  despublicar: ['publicado'],
  republicar: ['despublicado'],
  arquivar: ['nao_publicado', 'publicado', 'despublicado'],
}
const DESTINOS: Record<AcaoPublicacao, StatusPublicacao> = {
  despublicar: 'despublicado',
  republicar: 'publicado',
  arquivar: 'arquivado',
}

/** Novo status de publicação, ou `null` quando a transição não vale. */
export function aplicarAcaoPublicacao(
  atual: StatusPublicacao,
  acao: AcaoPublicacao,
  temVersaoPublicada: boolean,
): StatusPublicacao | null {
  if (!ORIGENS[acao].includes(atual)) return null
  if (acao === 'republicar' && !temVersaoPublicada) return null
  return DESTINOS[acao]
}

/** Primeira publicação fixa a data; republicar não reescreve. */
export function resolverPublicadoEm(anterior: Date | null, agora: Date): Date {
  return anterior ?? agora
}
