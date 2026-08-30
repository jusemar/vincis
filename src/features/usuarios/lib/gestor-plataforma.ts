import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import type { PerfilTipo } from '../types'

/**
 * Fonte única da resposta "esta pessoa administra a plataforma?".
 *
 * A pergunta é sobre uma **permissão**, não sobre quem a pessoa é. O Gestor da
 * Vincis continua sendo Profissional, dono do próprio escritório e Cliente
 * quando quiser — administrar a plataforma é uma capacidade a mais, e não uma
 * persona que substitui as outras. Por isso o que se lê aqui é a marca
 * `ehGestor`, resolvida no servidor a partir do conjunto de perfis da conta, e
 * não o perfil operacional dela.
 *
 * A forma antiga — comparar um perfil com `gestor_vincis` — continua aceita
 * para não quebrar chamadas que ainda carregam só um perfil, e porque contas
 * antigas de fato têm esse nome vinculado.
 *
 * O módulo é deliberadamente puro: nenhum import de banco, de React ou de
 * `next/*`. É o que permite que o middleware (`src/proxy.ts`), o servidor e os
 * componentes de `use client` decidam com exatamente a mesma função.
 *
 * Não confunda identificar com autorizar: esta função responde a partir de um
 * acesso **já resolvido no servidor**. Para fechar uma porta, use
 * `validarGestorVincis()` ou `exigirGestorDaPlataforma()`, que releem a sessão.
 */
type PortadorDePerfil =
  | PerfilTipo
  | { ehGestor: boolean }
  | { perfilTipo: PerfilTipo }
  | { perfil: PerfilTipo }
  | null
  | undefined

export function ehGestorPlataforma(alvo: PortadorDePerfil): boolean {
  if (!alvo) return false
  if (typeof alvo === 'string') return alvo === PERFIL_GESTOR_VINCIS
  if ('ehGestor' in alvo) return alvo.ehGestor
  const perfil = 'perfilTipo' in alvo ? alvo.perfilTipo : alvo.perfil
  return perfil === PERFIL_GESTOR_VINCIS
}
