import type { LocalNavegacao, NoConteudo, StatusPagina } from './nucleo/types'

/** Página na listagem da Gestão — sem o conteúdo, que pode ser longo. */
export type PaginaCmsGestaoDTO = {
  id: string
  titulo: string
  slug: string
  status: StatusPagina
  tituloSeo: string | null
  descricaoSeo: string | null
  publicadaEm: string | null
  updatedAt: string
}

export type ListagemPaginasCms = {
  itens: PaginaCmsGestaoDTO[]
  total: number
  pagina: number
  porPagina: number
}

export type ItemNavegacaoGestaoDTO = {
  id: string
  /** Item do submenu de um agrupador; `null` na raiz. */
  paiId: string | null
  /** `null` num agrupador (item sem página, só abre submenu). */
  paginaId: string | null
  paginaTitulo: string | null
  paginaSlug: string | null
  paginaStatus: StatusPagina | null
  /** Texto próprio do link; `null` usa o título da página. */
  texto: string | null
  ordem: number
  ativo: boolean
}

export type GrupoNavegacaoGestaoDTO = {
  id: string
  nome: string
  tituloPublico: string
  identificador: string
  local: LocalNavegacao
  ativo: boolean
  ordem: number
  itens: ItemNavegacaoGestaoDTO[]
}

export type PaginaCmsEdicaoDTO = PaginaCmsGestaoDTO & {
  conteudo: NoConteudo
  /** O conteúdo gravado não passou no schema atual e abriu vazio. */
  conteudoInvalido: boolean
}

export type PaginaAssociavelDTO = {
  id: string
  titulo: string
  slug: string
  status: StatusPagina
}
