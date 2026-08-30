import type { PerfilTipo } from '../types'

export const PERFIL_GESTOR_VINCIS = 'gestor_vincis' as const

/**
 * Prioridade dos perfis **operacionais** de uma conta.
 *
 * Operacional é o que a pessoa exerce na plataforma: presta serviço ou contrata
 * serviço. `gestor_vincis` não está nesta lista de propósito — ele não é uma
 * forma de usar a Vincis, é uma **permissão sobre a Vincis**, e as duas coisas
 * convivem na mesma conta.
 *
 * Enquanto o Gestor liderava esta lista, `escolherPerfilPrincipal` devolvia
 * `gestor_vincis` e apagava tudo o mais: quem administrava a plataforma deixava
 * de ser reconhecido como Profissional, perdia o escritório, o painel e o
 * acesso aos fluxos de Cliente. Um único enum não pode responder "quem é a
 * pessoa" e "o que ela pode administrar" ao mesmo tempo.
 */
export const PRIORIDADE_PERFIS: PerfilTipo[] = [
  'profissional',
  'contador',
  'advogado',
  'colaborador',
  'cliente',
]

/**
 * Perfil operacional a partir dos nomes vinculados à conta.
 *
 * Uma conta sem nenhum perfil operacional (só `gestor_vincis`, por exemplo)
 * responde `cliente`: é o menor conjunto de capacidades, e é o que ela de fato
 * pode exercer enquanto não completar um cadastro de prestador.
 */
export function escolherPerfilPrincipal(nomes: string[]): PerfilTipo {
  const conjunto = new Set(nomes)
  return PRIORIDADE_PERFIS.find((perfil) => conjunto.has(perfil)) ?? 'cliente'
}

/** A conta administra a plataforma? Pergunta independente da anterior. */
export function ehGestorNosPerfis(nomes: string[]): boolean {
  return nomes.includes(PERFIL_GESTOR_VINCIS)
}
