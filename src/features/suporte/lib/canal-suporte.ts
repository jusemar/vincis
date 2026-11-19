/**
 * Canal de contato com o Suporte Vincis — arquivo puro.
 *
 * Hoje o destino é a Central de Ajuda da própria Vincis (`/suporte`), uma
 * página real com os canais oficiais. O botão funciona de verdade, sem URL
 * inventada.
 *
 * Ponto de extensão para o futuro: um provedor de conversa (ex.: o Jaaa) entra
 * em `PROVEDORES_CONVERSA` e devolve o link da conversa com o atendente. Nada
 * de nenhum provedor é configurado ou chamado nesta versão — a lista está
 * vazia de propósito. Quem desenha o botão não precisa mudar.
 */
export type CanalSuporte = {
  rotulo: string
  href: string
  /** `pagina_suporte` (Central de Ajuda) ou `conversa` (provedor externo). */
  tipo: 'pagina_suporte' | 'conversa'
  /** Abre em outra aba (provedor externo). */
  externo: boolean
}

export type ProvedorConversaSuporte = {
  nome: string
  /** Link da conversa com o atendente, ou `null` quando não há (o próximo é tentado). */
  linkDaConversa: (atendenteId: string) => string | null
}

/** Vazio: nenhuma integração ativa. Ver comentário do arquivo. */
const PROVEDORES_CONVERSA: readonly ProvedorConversaSuporte[] = []

const ROTA_CENTRAL_DE_AJUDA = '/suporte'
export const ROTULO_FALAR_COM_SUPORTE = 'Falar com o Suporte Vincis'

/** Canal para falar com um integrante da equipe Vincis (autor de artigo, por exemplo). */
export function canalSuporteDoAtendente(atendenteId: string): CanalSuporte {
  for (const provedor of PROVEDORES_CONVERSA) {
    const link = provedor.linkDaConversa(atendenteId)
    if (link) return { rotulo: ROTULO_FALAR_COM_SUPORTE, href: link, tipo: 'conversa', externo: true }
  }
  return { rotulo: ROTULO_FALAR_COM_SUPORTE, href: ROTA_CENTRAL_DE_AJUDA, tipo: 'pagina_suporte', externo: false }
}
