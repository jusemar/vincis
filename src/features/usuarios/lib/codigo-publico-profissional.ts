import { randomBytes } from 'node:crypto'

/**
 * O identificador público do prestador: `PRO-XXXXXX`.
 *
 * ## Por que não o `id`
 *
 * O `id` da linha é uuid e pertence ao banco. O que aparece no card do
 * parceiro e no perfil público é lido, ditado e conferido por pessoas — e
 * expor a chave técnica de uma linha em tela pública entrega ao mundo o
 * endereço interno de um registro, de graça.
 *
 * ## O alfabeto
 *
 * O mesmo critério do código de parceiro, em caixa alta: sem `0`, `1`, `I`,
 * `L`, `O` e `U`. Os cinco primeiros se confundem entre si em qualquer fonte,
 * e o código vai ser lido em voz alta; o `U` sai para que nenhum palavrão em
 * português se forme por acaso no identificador de alguém.
 *
 * Seis caracteres dão 30⁶ ≈ 7,3 × 10⁸ combinações — folga larga sobre o número
 * de prestadores que a plataforma terá, e nada aqui é sequencial: um código que
 * contasse profissionais diria quantos a Vincis tem.
 */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const TAMANHO = 6
const PREFIXO = 'PRO-'

/** O texto tem a forma de um código público? Não diz se ele existe. */
export function codigoPublicoBemFormado(codigo: string): boolean {
  const limpo = codigo.trim().toUpperCase()
  if (!limpo.startsWith(PREFIXO)) return false
  const corpo = limpo.slice(PREFIXO.length)
  return (
    corpo.length === TAMANHO &&
    [...corpo].every((letra) => ALFABETO.includes(letra))
  )
}

/**
 * Um código novo, sorteado no servidor.
 *
 * Sorteio por rejeição, e não `byte % 30`: o resto simples faria os dezesseis
 * primeiros caracteres saírem com mais frequência que os outros quatorze,
 * porque 256 não é múltiplo de 30. Quem garante a unicidade é o índice único da
 * coluna — a colisão no insert, e não uma consulta antes dele.
 */
export function gerarCodigoPublicoProfissional(): string {
  const limite = 256 - (256 % ALFABETO.length)
  let corpo = ''

  while (corpo.length < TAMANHO) {
    for (const byte of randomBytes(TAMANHO * 2)) {
      if (byte >= limite) continue
      corpo += ALFABETO[byte % ALFABETO.length]
      if (corpo.length === TAMANHO) break
    }
  }

  return `${PREFIXO}${corpo}`
}
