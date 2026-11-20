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

/**
 * Contato público oficial da Vincis: conversa direta com o Junior no Jaaa.
 *
 * Substitui e-mail e WhatsApp no rodapé e na página Contato. O endereço
 * `https://jaaa.com.br/@<usuario>` é o "link do Jaa": a rota `/@usuario` do Jaaa
 * abre a conversa com aquela identidade. Sem conta, a pessoa vê o perfil
 * público e entra para conversar. Conferido em 20/11/2026: a API pública do Jaaa
 * devolve a identidade `@junior` (pessoal, "Junior"), e um @usuario inexistente
 * dá 404.
 *
 * A foto é uma cópia local da foto de perfil do Jaaa. O link público do Jaaa
 * muda quando a foto é trocada, e a cópia evita imagem quebrada e requisição
 * a terceiros a cada visita.
 *
 * Fica separado de `PROVEDORES_CONVERSA` de propósito: aquela lista recebe o id
 * de um atendente da Vincis (autor de artigo) e ainda não há mapeamento para
 * usuários do Jaaa.
 */
const ORIGEM_JAAA = 'https://jaaa.com.br'

/** Link do Jaa: abre a conversa com o @usuario informado. */
export function linkConversaJaaa(nomeUsuario: string): string {
  return `${ORIGEM_JAAA}/@${encodeURIComponent(nomeUsuario)}`
}

export const CONTATO_OFICIAL_JAAA = {
  nome: 'Junior',
  nomeUsuario: 'junior',
  href: linkConversaJaaa('junior'),
  fotoSrc: '/images/contato/junior-jaaa.webp',
} as const

/** Canal para falar com um integrante da equipe Vincis (autor de artigo, por exemplo). */
export function canalSuporteDoAtendente(atendenteId: string): CanalSuporte {
  for (const provedor of PROVEDORES_CONVERSA) {
    const link = provedor.linkDaConversa(atendenteId)
    if (link) return { rotulo: ROTULO_FALAR_COM_SUPORTE, href: link, tipo: 'conversa', externo: true }
  }
  return { rotulo: ROTULO_FALAR_COM_SUPORTE, href: ROTA_CENTRAL_DE_AJUDA, tipo: 'pagina_suporte', externo: false }
}
