import type { Situacao } from '../constants/situacao'

/**
 * A forma do Manual da Vincis.
 *
 * O conteúdo é dado, e não marcação solta dentro de componente: é o que permite
 * que o índice, a busca e a renderização leiam exatamente o mesmo texto. Texto
 * aceita um único recurso de formatação — `**destaque**` — para que quem
 * escreve o manual nunca precise conhecer HTML.
 */

/** Uma célula de tabela: texto simples ou o selo de situação de um recurso. */
export type CelulaManual = string | { situacao: Situacao; texto?: string }

/** Um campo de ficha. Lista numerada quando a ordem é o passo a passo. */
export type CampoFicha = {
  rotulo: string
  conteudo: string | string[]
  ordenada?: boolean
}

export type BlocoManual =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'lista'; itens: string[]; ordenada?: boolean }
  | { tipo: 'tabela'; colunas: string[]; linhas: CelulaManual[][] }
  | { tipo: 'ficha'; titulo: string; situacao: Situacao; campos: CampoFicha[] }
  | {
      tipo: 'aviso'
      /** `critico` é limitação que muda o que se diz a um usuário. */
      nivel: 'dica' | 'atencao' | 'critico'
      titulo: string
      texto?: string
      itens?: string[]
    }
  | { tipo: 'checklist'; id: string; itens: string[] }
  | { tipo: 'glossario'; termos: { termo: string; definicao: string }[] }
  | { tipo: 'mapa'; ramos: { titulo: string; itens: string[] }[] }

export type CapituloManual = {
  /** Âncora estável: vira `#id` na URL e chave das marcações de checklist. */
  id: string
  titulo: string
  /** Em que parte do índice o capítulo aparece. */
  parte: ParteManual
  /** Uma frase que diz para que serve o capítulo. */
  resumo: string
  blocos: BlocoManual[]
}

export const PARTES_MANUAL = [
  'Primeiros passos',
  'Quem usa a Vincis',
  'Como as coisas funcionam',
  'Administração e avisos',
  'Testes e suporte',
] as const

export type ParteManual = (typeof PARTES_MANUAL)[number]
