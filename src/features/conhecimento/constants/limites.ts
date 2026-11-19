/** Limites da Central de Conhecimento — um lugar só para servidor e formulário. */
export const LIMITES_ARTIGO = {
  titulo: { min: 10, max: 180 },
  resumo: { min: 40, max: 320 },
  tituloSeo: 180,
  descricaoSeo: 320,
  capaAlt: 180,
  /** Texto mínimo do corpo para enviar à aprovação (em caracteres). */
  corpoMinimoEnvio: 600,
  /** Árvore JSON do editor, serializada. */
  conteudoBytes: 400_000,
  imagensNoCorpo: 20,
  fontes: 20,
  fonteTitulo: 300,
  observacao: 2_000,
  /** URL amigável (`/conhecimento/<slug>`). */
  slug: { min: 3, max: 140 },
  palavrasChave: 10,
  palavraChave: { min: 2, max: 40 },
} as const

/** Faixas recomendadas para o resultado no Google (aproximação visual). */
export const RECOMENDACAO_SEO = { titulo: 60, descricao: 155 } as const

export const LIMITES_CATEGORIA = { nome: 80, descricao: 300, chamada: 200 } as const

/** Imagens enviadas (capa e corpo). */
export const IMAGEM_ARTIGO = {
  tamanhoMaximo: 5 * 1024 * 1024,
  tipos: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const

export const POR_PAGINA_CONHECIMENTO = 9
export const POR_PAGINA_GESTAO_CONHECIMENTO = 20
export const LIMITE_DESTAQUES = 3
export const LIMITE_RELACIONADOS = 3
export const LIMITE_ARTIGOS_NO_PERFIL = 6
export const LIMITE_ARTIGOS_SITEMAP = 40_000
