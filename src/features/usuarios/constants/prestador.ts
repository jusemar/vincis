import type { PerfilTipo } from '../types'

/**
 * Fonte de verdade da separação entre "quem a pessoa é" e "o que ela exerce".
 *
 * A plataforma tem dois tipos de prestador, e só dois:
 *
 * - `profissional`: pessoa com formação/habilitação regulamentada da área
 *   (contador, advogado). Informa registro (CRC/OAB), anexa comprovante e passa
 *   por análise da Vincis.
 * - `colaborador`: pessoa com conhecimento técnico sem habilitação
 *   regulamentada. Não informa registro, não anexa comprovante e não passa por
 *   análise de habilitação.
 *
 * Atuar sozinho ou dentro de um escritório NÃO é tipo de pessoa: é forma de
 * atuação. O papel exercido dentro de um escritório (proprietário,
 * administrador, profissional, colaborador) vive em `empresa_membros.funcao`.
 */
export const TIPOS_PRESTADOR = ['profissional', 'colaborador'] as const

export type TipoPrestador = (typeof TIPOS_PRESTADOR)[number]

/**
 * Perfis de `usuarios_perfis` que identificam a pessoa como Profissional.
 * `contador` e `advogado` são nomes legados do catálogo: continuam aceitos para
 * não invalidar contas antigas, mas o cadastro atual sempre grava
 * `profissional`.
 */
export const PERFIS_PESSOA_PROFISSIONAL: PerfilTipo[] = [
  'profissional',
  'contador',
  'advogado',
]

export const PERFIL_PESSOA_COLABORADOR: PerfilTipo = 'colaborador'

/**
 * Status de `perfis_profissionais.status_analise` que habilita cada tipo a
 * operar.
 *
 * O Colaborador tem um status próprio (`ativo`) exatamente para que nunca seja
 * necessário marcá-lo como `aprovado` — `aprovado` significa habilitação
 * técnica regulamentada verificada, o que não se aplica a ele.
 */
export const STATUS_PRESTADOR_HABILITADO: Record<TipoPrestador, string> = {
  profissional: 'aprovado',
  colaborador: 'ativo',
}

/** Onde cada tipo completa o cadastro antes de operar no /admin. */
export const ROTA_CADASTRO_PRESTADOR: Record<TipoPrestador, string> = {
  profissional: '/cadastro-profissional',
  colaborador: '/cadastro-colaborador',
}

/** Rótulos de interface do tipo da pessoa. */
export const ROTULO_TIPO_PRESTADOR: Record<TipoPrestador, string> = {
  profissional: 'Profissional',
  colaborador: 'Colaborador',
}
