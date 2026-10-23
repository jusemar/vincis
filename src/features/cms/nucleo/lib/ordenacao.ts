/**
 * Uma reordenação só é aceita quando traz exatamente o conjunto atual.
 *
 * Lista parcial, com sobra ou com repetição seria uma ordem ambígua — e, no
 * meio de duas abas abertas, a forma de um item "sumir" da navegação. Recusar
 * obriga quem reordena a partir do estado real.
 */
export function ordenacaoEhCompleta(atuais: readonly string[], propostos: readonly string[]) {
  if (atuais.length !== propostos.length) return false
  const conjuntoProposto = new Set(propostos)
  if (conjuntoProposto.size !== propostos.length) return false
  return atuais.every((id) => conjuntoProposto.has(id))
}
