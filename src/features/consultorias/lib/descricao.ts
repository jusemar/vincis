import { LIMITE_DESCRICAO_CONSULTORIA } from '../constants/contratacao'
import { DescricaoConsultoriaSchema } from '../schemas/contratacao'

/**
 * O campo "O que você deseja tratar na consultoria?" fora do React.
 *
 * O componente pergunta, estas funções respondem. Ficam separadas porque a
 * regra do campo é testável sem montar nada — e porque o contador e a validade
 * discordam de propósito: o contador conta o que foi **digitado** (espaços
 * inclusive, senão o número pula enquanto se escreve), e a validade olha o
 * texto **aparado**, senão mil espaços passariam por descrição.
 */

/** Quantos caracteres o contador `0 / 1000` deve mostrar. */
export function contarCaracteres(texto: string): number {
  return texto.length
}

/** Quantos ainda cabem. Negativo quando o limite já foi ultrapassado. */
export function restanteDeCaracteres(texto: string): number {
  return LIMITE_DESCRICAO_CONSULTORIA - texto.length
}

export function excedeuLimite(texto: string): boolean {
  return texto.length > LIMITE_DESCRICAO_CONSULTORIA
}

export function descricaoValida(texto: string): boolean {
  return DescricaoConsultoriaSchema.safeParse(texto).success
}

/**
 * A mensagem de erro do campo, ou `null` quando não há o que dizer.
 *
 * Só fala depois que o campo foi tocado: acusar "campo obrigatório" antes de a
 * pessoa ter chance de digitar é ruído, não ajuda. Ultrapassar o limite é a
 * exceção — esse erro aparece na hora, porque o texto excedente já está na
 * tela e ficar em silêncio faria o botão desabilitado parecer defeito.
 */
export function erroDaDescricao(texto: string, tocado: boolean): string | null {
  if (excedeuLimite(texto)) {
    return `Use no máximo ${LIMITE_DESCRICAO_CONSULTORIA} caracteres.`
  }
  if (!tocado) return null
  const resultado = DescricaoConsultoriaSchema.safeParse(texto)
  return resultado.success ? null : (resultado.error.issues[0]?.message ?? null)
}
