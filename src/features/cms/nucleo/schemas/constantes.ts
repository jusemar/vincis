/**
 * Listas fechadas do CMS. As tabelas repetem as mesmas listas num `check`: o
 * banco recusa o que a validação deixasse passar por engano.
 */
export const STATUS_PAGINA = ['rascunho', 'publicada', 'arquivada'] as const

/** Onde um grupo de navegação aparece. */
export const LOCAIS_NAVEGACAO = ['rodape', 'cabecalho'] as const

/**
 * Locais que aceitam agrupador e submenu. O rodapé é uma lista plana de links
 * por coluna; o cabeçalho é um menu.
 */
export const LOCAIS_COM_SUBMENU: readonly (typeof LOCAIS_NAVEGACAO)[number][] = ['cabecalho']

/** Níveis abaixo da raiz. 1 = um submenu, sem submenu dentro de submenu. */
export const PROFUNDIDADE_MAXIMA_SUBMENU = 1

export const LIMITES_CMS = {
  titulo: 180,
  tituloSeo: 180,
  descricaoSeo: 320,
  nomeGrupo: 120,
  tituloPublicoGrupo: 120,
  textoItem: 180,
  /** Tamanho máximo do documento serializado, em caracteres. */
  conteudo: 1_000_000,
  porPagina: 100,
} as const
