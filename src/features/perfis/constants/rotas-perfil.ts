/**
 * Endereços do perfil público — arquivo puro (cliente e servidor).
 *
 * - `/profissionais/<slug>`: o endereço oficial, amigável e permanente.
 * - `/perfil-profissional?prestador=<id>`: o formato antigo. Continua
 *   respondendo e redireciona (308) para o amigável, para que indicações,
 *   agendamentos e links já compartilhados não quebrem.
 */
export const PREFIXO_PERFIL_AMIGAVEL = '/profissionais'

export function caminhoPerfilAmigavel(slug: string): string {
  return `${PREFIXO_PERFIL_AMIGAVEL}/${encodeURIComponent(slug)}`
}

export function caminhoPerfilLegado(prestadorId: string): string {
  return `/perfil-profissional?prestador=${encodeURIComponent(prestadorId)}`
}

/** O melhor endereço disponível: amigável quando há slug; senão o antigo. */
export function caminhoDoPerfilPublico(prestadorId: string, slug: string | null | undefined): string {
  return slug ? caminhoPerfilAmigavel(slug) : caminhoPerfilLegado(prestadorId)
}
