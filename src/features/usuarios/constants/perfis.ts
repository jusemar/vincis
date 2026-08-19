import type { PerfilTipo } from '../types'

export const PERFIL_GESTOR_VINCIS = 'gestor_vincis' as const

/**
 * Prioridade única de perfis, usada em toda a aplicação.
 *
 * Evita depender da ordem física dos vínculos em `usuarios_perfis` quando
 * houver dados legados com mais de um perfil na mesma conta.
 */
export const PRIORIDADE_PERFIS: PerfilTipo[] = [
  PERFIL_GESTOR_VINCIS,
  'profissional',
  'contador',
  'advogado',
  'colaborador',
  'cliente',
]

/** Perfil principal a partir dos nomes vinculados à conta. */
export function escolherPerfilPrincipal(nomes: string[]): PerfilTipo {
  const conjunto = new Set(nomes)
  return PRIORIDADE_PERFIS.find((perfil) => conjunto.has(perfil)) ?? 'cliente'
}
