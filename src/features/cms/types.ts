import type { LocalNavegacao, NoConteudo, StatusPagina } from './nucleo/types'
import type { EstiloCardHome, TipoDestinoCardHome } from './integracao/cards-home/constantes'

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

/** Card da Home na Gestão, com o destino resolvido para a tela. */
export type CardHomeGestaoDTO = {
  id: string
  selo: string | null
  titulo: string
  descricao: string
  textoBotao: string
  estilo: EstiloCardHome
  destinoTipo: TipoDestinoCardHome
  paginaId: string | null
  paginaTitulo: string | null
  paginaSlug: string | null
  paginaStatus: StatusPagina | null
  rota: string | null
  ativo: boolean
  ordem: number
  /** Endereço público, ou `null` quando o destino está fora do ar (o card não aparece). */
  href: string | null
  updatedAt: string
}

/** Card pronto para a Home: só os ativos, com destino válido, já em ordem. */
export type CardHomePublicoDTO = {
  id: string
  selo: string | null
  titulo: string
  descricao: string
  textoBotao: string
  estilo: EstiloCardHome
  href: string
  /**
   * Só quando o card exibe um artigo da Central com capa: a mesma URL e o mesmo
   * texto alternativo da capa publicada (nada copiado). Card original: ausente.
   */
  imagem?: ImagemCardHome | null
}

export type ImagemCardHome = { url: string; alt: string }
