/**
 * Como um escritório se apresenta publicamente.
 *
 * O nome cadastrado (`empresas.nome`) é exibido como está — nada é removido de
 * nomes empresariais. A identificação "Escritório" entra como etiqueta separada
 * ("Escritório | Alfa") e **não** é repetida quando o próprio nome já começa
 * com ela ("Escritório Contábil Gestor Local").
 */

/** O nome já se apresenta como escritório? (ignora caixa e acento) */
export function nomeJaIdentificaEscritorio(nome: string) {
  return /^escrit[oó]rio\b/i.test(nome.trim())
}

/**
 * Partes do título: `rotulo` ("Escritório", ou nulo quando o nome já traz a
 * palavra) e o `nome` cadastrado, intacto.
 */
export function tituloDoEscritorio(nome: string): { rotulo: string | null; nome: string } {
  const limpo = nome.trim()
  return { rotulo: nomeJaIdentificaEscritorio(limpo) ? null : 'Escritório', nome: limpo }
}

/** Em texto corrido: "Escritório Alfa" (ou o nome, se já identifica). */
export function nomeCompletoDoEscritorio(nome: string) {
  const { rotulo, nome: limpo } = tituloDoEscritorio(nome)
  return rotulo ? `${rotulo} ${limpo}` : limpo
}
