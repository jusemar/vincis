import { SITUACAO } from '../constants/situacao'
import type { BlocoManual, CapituloManual, CelulaManual } from '../types/manual'

/**
 * Busca dentro do Manual da Vincis.
 *
 * Pura e local: o manual inteiro já está na página, então procurar é comparar
 * texto — sem servidor, sem índice e sem biblioteca. Acentos e maiúsculas são
 * ignorados, porque quem procura "comissao" quer encontrar "Comissão".
 */

/** "Comissão Recorrente" → "comissao recorrente". */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*\*/g, '')
    .toLowerCase()
}

function textoDaCelula(celula: CelulaManual): string {
  if (typeof celula === 'string') return celula
  return `${SITUACAO[celula.situacao].rotulo} ${celula.texto ?? ''}`
}

/** Todo o texto legível de um bloco, na forma em que a pessoa o lê. */
export function textoDoBloco(bloco: BlocoManual): string {
  switch (bloco.tipo) {
    case 'paragrafo':
    case 'subtitulo':
      return bloco.texto
    case 'lista':
    case 'checklist':
      return bloco.itens.join(' ')
    case 'tabela':
      return [
        ...bloco.colunas,
        ...bloco.linhas.flatMap((linha) => linha.map(textoDaCelula)),
      ].join(' ')
    case 'ficha':
      return [
        bloco.titulo,
        SITUACAO[bloco.situacao].rotulo,
        ...bloco.campos.flatMap((campo) => [
          campo.rotulo,
          ...(Array.isArray(campo.conteudo) ? campo.conteudo : [campo.conteudo]),
        ]),
      ].join(' ')
    case 'aviso':
      return [bloco.titulo, bloco.texto ?? '', ...(bloco.itens ?? [])].join(' ')
    case 'glossario':
      return bloco.termos.map((t) => `${t.termo} ${t.definicao}`).join(' ')
    case 'mapa':
      return bloco.ramos.map((r) => `${r.titulo} ${r.itens.join(' ')}`).join(' ')
  }
}

/** Palavras da consulta, já normalizadas. Vazio quando não há o que buscar. */
export function termosDaBusca(consulta: string): string[] {
  return normalizarTexto(consulta).split(/\s+/).filter((termo) => termo.length > 1)
}

/** O texto contém **todas** as palavras procuradas, em qualquer ordem. */
function contemTodos(texto: string, termos: string[]) {
  const normalizado = normalizarTexto(texto)
  return termos.every((termo) => normalizado.includes(termo))
}

export type ResultadoDaBusca = {
  capitulo: CapituloManual
  /** Índices dos blocos que atendem à busca, na ordem do capítulo. */
  blocos: number[]
}

/**
 * Capítulos que atendem à busca, cada um com os blocos encontrados.
 *
 * Um capítulo cujo título atende à busca entra inteiro: quem procurou
 * "Parceiros" quer o capítulo, e não só os parágrafos que repetem a palavra.
 */
export function buscarNoManual(
  capitulos: CapituloManual[],
  consulta: string,
): ResultadoDaBusca[] {
  const termos = termosDaBusca(consulta)
  if (!termos.length) {
    return capitulos.map((capitulo) => ({
      capitulo,
      blocos: capitulo.blocos.map((_, indice) => indice),
    }))
  }

  return capitulos.flatMap((capitulo) => {
    if (contemTodos(`${capitulo.titulo} ${capitulo.resumo}`, termos)) {
      return [{ capitulo, blocos: capitulo.blocos.map((_, indice) => indice) }]
    }
    const blocos = capitulo.blocos
      .map((bloco, indice) => (contemTodos(textoDoBloco(bloco), termos) ? indice : -1))
      .filter((indice) => indice >= 0)
    return blocos.length ? [{ capitulo, blocos }] : []
  })
}
