import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

/**
 * Regra única de telefone brasileiro da Vincis (cadastro, dados da conta,
 * login, identificação e recuperação de senha).
 *
 * - A pessoa pode digitar como quiser: "(31) 99252-5777", "31 992525777",
 *   "+55 31 99252-5777", "031992525777" — tudo vira o mesmo número.
 * - Formato gravado: **DDD + número, só dígitos** ("31992525777"), o mesmo que
 *   a maioria das contas já tinha. O +55 é implícito (a Vincis é só Brasil).
 * - A validação usa os metadados do libphonenumber (DDD e faixa de celular),
 *   não só a contagem de dígitos — mesma biblioteca do Jaaa.
 *
 * Números antigos gravados com máscara continuam válidos: a busca compara os
 * dígitos (`condicaoTelefoneIgual`, em `telefone-sql.ts`), sem precisar reescrever o cadastro.
 */

const TAMANHO_MAXIMO_ENTRADA = 32

function analisar(entrada: string) {
  const texto = entrada.trim()
  if (!texto || texto.length > TAMANHO_MAXIMO_ENTRADA || texto.includes('@')) return null
  const numero = parsePhoneNumberFromString(texto, 'BR')
  if (!numero || numero.country !== 'BR' || !numero.isValid()) return null
  return numero
}

/** Celular brasileiro válido → "31992525777" (DDD + número). Fixo ou inválido → null. */
export function normalizarCelularBR(entrada: string): string | null {
  const numero = analisar(entrada)
  if (!numero) return null
  const tipo = numero.getType()
  if (tipo !== 'MOBILE' && tipo !== 'FIXED_LINE_OR_MOBILE') return null
  return String(numero.nationalNumber)
}

/** "31992525777" → "5531992525777": formato do provedor de SMS (55 + DDD + número, sem "+"). */
export function celularInternacional(nacional: string): string {
  return `55${nacional}`
}

/** "(31) •••••-5777": telefone é dado privado; em tela/log, só DDD e final. */
export function mascararCelular(nacional: string): string {
  if (nacional.length < 10) return '••••'
  return `(${nacional.slice(0, 2)}) ${'•'.repeat(nacional.length - 6)}-${nacional.slice(-4)}`
}

/** Máscara enquanto a pessoa digita: "31992525777" → "(31) 99252-5777". Só exibição. */
export function formatarCelularDigitado(valor: string): string {
  const d = valor.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
