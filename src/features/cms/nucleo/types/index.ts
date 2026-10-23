import type { STATUS_PAGINA, LOCAIS_NAVEGACAO } from '../schemas/constantes'
import type { NoConteudo } from '../conteudo/schema'

export type StatusPagina = (typeof STATUS_PAGINA)[number]
export type LocalNavegacao = (typeof LOCAIS_NAVEGACAO)[number]

export type DocumentoConteudo = NoConteudo & { type: 'doc' }
export type { NoConteudo }

/** Resposta padrão das operações do CMS — o mesmo formato das actions do projeto. */
export type ResultadoCms<T = undefined> =
  | { sucesso: true; mensagem: string; dados?: T }
  | { sucesso: false; mensagem: string; campo?: string; dados?: undefined }
