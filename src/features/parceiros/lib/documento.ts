/**
 * Validação de CPF e CNPJ.
 *
 * Nasce aqui porque a plataforma não guardava documento em lugar nenhum até
 * agora — e continua não guardando: CPF e CNPJ entram no programa apenas como
 * **tipos possíveis de chave Pix**, nunca como requisito para ser parceiro.
 *
 * O que estas funções fazem é conferir o dígito verificador, isto é, se o
 * número é bem formado. Não dizem que ele existe na Receita, nem que pertence a
 * quem informou — nenhuma verificação de titularidade acontece na Vincis.
 */

/** Só os dígitos. É nesta forma que o documento é comparado e guardado. */
export function digitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * O dígito verificador de um trecho, pelo algoritmo de módulo 11.
 *
 * Um só cálculo para CPF e CNPJ: muda o tamanho e a sequência de pesos, não a
 * aritmética. Escrever duas versões quase iguais convidaria a corrigir uma e
 * esquecer a outra.
 */
function digitoModulo11(base: string, pesos: number[]): number {
  const soma = base
    .split('')
    .reduce((total, letra, indice) => total + Number(letra) * pesos[indice], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/**
 * CPF bem formado?
 *
 * Onze dígitos, e não todos iguais: `111.111.111-11` passa na conta do módulo
 * 11 por acidente aritmético, e é justamente o valor que alguém digita para
 * testar se o formulário aceita qualquer coisa.
 */
export function cpfValido(valor: string): boolean {
  const numero = digitos(valor)
  if (numero.length !== 11 || /^(\d)\1+$/.test(numero)) return false

  const primeiro = digitoModulo11(numero.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = digitoModulo11(
    numero.slice(0, 10),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  )
  return numero.endsWith(`${primeiro}${segundo}`)
}

/** CNPJ bem formado? Mesma ideia, com quatorze dígitos e os pesos do CNPJ. */
export function cnpjValido(valor: string): boolean {
  const numero = digitos(valor)
  if (numero.length !== 14 || /^(\d)\1+$/.test(numero)) return false

  const pesosPrimeiro = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesosSegundo = [6, ...pesosPrimeiro]
  const primeiro = digitoModulo11(numero.slice(0, 12), pesosPrimeiro)
  const segundo = digitoModulo11(numero.slice(0, 13), pesosSegundo)
  return numero.endsWith(`${primeiro}${segundo}`)
}

/**
 * Chave aleatória do Pix (EVP).
 *
 * É um UUID versão 4, do jeito que o Banco Central a emite: trinta e dois
 * dígitos hexadecimais em cinco grupos. Aceitar qualquer texto aqui deixaria
 * passar um erro de digitação que só apareceria na hora do pagamento.
 */
export function evpValida(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor.trim(),
  )
}
