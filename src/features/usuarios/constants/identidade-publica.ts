/**
 * Identidade pública — arquivo puro (cliente e servidor).
 *
 * Responde só "como esta pessoa se apresenta em público". Nunca é usada para
 * autorizar nada: permissões vêm de `usuarios_perfis`/RBAC, e capacidades de
 * teste (Gestor que também opera como prestador) continuam intactas.
 */
export const IDENTIDADES_PUBLICAS = ['pessoal', 'equipe_vincis'] as const
export type IdentidadePublica = (typeof IDENTIDADES_PUBLICAS)[number]

/** Textos fixos da equipe da plataforma — sem campo livre (não há como forjar). */
export const APRESENTACAO_EQUIPE_VINCIS = {
  funcao: 'Gestor da Plataforma Vincis',
  identificacao: 'Equipe Vincis · Suporte e Gestão',
} as const

export const ROTULO_IDENTIDADE: Record<IdentidadePublica, string> = {
  pessoal: 'Pessoal (cadastro profissional)',
  equipe_vincis: 'Equipe Vincis (Gestor da Plataforma)',
}
