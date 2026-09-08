import { randomBytes } from 'node:crypto'

/**
 * O identificador público do parceiro.
 *
 * ## Por que não o `id`
 *
 * O `id` da linha é uuid e serve para o banco. O que vai no link é lido em voz
 * alta, digitado à mão e colado em legenda de rede social — precisa ser curto e
 * não pode ser confundível. E, principalmente, não pode ser sequencial nem
 * derivado de dado da conta: um código que contasse parceiros diria quantos a
 * Vincis tem, e um derivado do e-mail vazaria a conta de quem indicou.
 *
 * ## O alfabeto
 *
 * Trinta caracteres: dígitos e letras minúsculas, sem `0`, `1`, `i`, `l`, `o` e
 * `u`. Os cinco primeiros saem porque se confundem entre si em qualquer fonte —
 * e o código vai ser ditado por telefone. O `u` sai por outro motivo: sem ele,
 * nenhum palavrão em português se forma por acaso no link de alguém.
 *
 * Oito caracteres dão 30⁸ ≈ 6,5 × 10¹¹ combinações. Não é para ser adivinhado,
 * mas também não é segredo: o código é público por natureza, e a segurança do
 * programa nunca pode depender de ninguém não descobrir o link de outro.
 */
const ALFABETO = '23456789abcdefghjkmnpqrstvwxyz'
const TAMANHO = 8

/** Aceita o código em qualquer caixa; a forma guardada é minúscula. */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toLowerCase()
}

/** O texto tem a forma de um código de parceiro? Não diz se ele existe. */
export function codigoBemFormado(codigo: string): boolean {
  const limpo = normalizarCodigo(codigo)
  if (limpo.length !== TAMANHO) return false
  return [...limpo].every((letra) => ALFABETO.includes(letra))
}

/**
 * Um código novo, sorteado no servidor.
 *
 * Sorteio por rejeição, e não `byte % 30`: o resto simples faria os dezesseis
 * primeiros caracteres do alfabeto saírem com mais frequência que os outros
 * quatorze, porque 256 não é múltiplo de 30. O viés não quebraria nada hoje,
 * mas estreitaria de graça o espaço de códigos.
 *
 * Sortear não é garantir: quem grava é o índice único de `parceiros.codigo`, e
 * é a colisão no insert — não uma consulta antes dele — que decide se o código
 * já era de alguém.
 */
export function gerarCodigoDoParceiro(): string {
  const limite = 256 - (256 % ALFABETO.length)
  let codigo = ''

  while (codigo.length < TAMANHO) {
    for (const byte of randomBytes(TAMANHO * 2)) {
      if (byte >= limite) continue
      codigo += ALFABETO[byte % ALFABETO.length]
      if (codigo.length === TAMANHO) break
    }
  }

  return codigo
}
