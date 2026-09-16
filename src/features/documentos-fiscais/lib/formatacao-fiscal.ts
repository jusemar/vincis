/**
 * Apresentação dos números fiscais — sem passar por `number`.
 *
 * Os valores chegam do banco como string (`numeric` do PostgreSQL), exatamente
 * como estavam no XML. Convertê-los para `number` só para exibir reintroduziria
 * o arredondamento que o projeto inteiro evita desde a Fase 1.3: `0.1 + 0.2`,
 * valor unitário de dez casas, total de treze inteiros. Aqui o texto é
 * reescrito como texto — separador de milhar, vírgula decimal —, e o que entrou
 * é o que sai.
 *
 * Arquivo puro: serve ao servidor e aos componentes de tela.
 */

const DECIMAL = /^-?\d+(\.\d+)?$/

function partes(valor: string) {
  const negativo = valor.startsWith('-')
  const [inteira, decimal = ''] = valor.replace('-', '').split('.')
  return { negativo, inteira, decimal }
}

function agrupar(inteira: string) {
  return inteira.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Ajusta a parte decimal para exatamente `casas` dígitos, sem arredondar para cima. */
function comCasas(decimal: string, casas: number) {
  return decimal.padEnd(casas, '0').slice(0, casas)
}

/** `376.01` → `R$ 376,01`. Ausência vira travessão, nunca `R$ 0,00`. */
export function formatarMoeda(valor: string | null | undefined, ausente = '—'): string {
  if (!valor || !DECIMAL.test(valor)) return valor?.trim() || ausente
  const { negativo, inteira, decimal } = partes(valor)
  return `${negativo ? '-' : ''}R$ ${agrupar(inteira)},${comCasas(decimal, 2)}`
}

/** `10.0000` → `10`; `1.5000` → `1,5`. Zeros à direita não dizem nada na tela. */
export function formatarQuantidade(valor: string | null | undefined, ausente = '—'): string {
  if (!valor || !DECIMAL.test(valor)) return valor?.trim() || ausente
  const { negativo, inteira, decimal } = partes(valor)
  const enxuta = decimal.replace(/0+$/, '')
  return `${negativo ? '-' : ''}${agrupar(inteira)}${enxuta ? `,${enxuta}` : ''}`
}

/** `25.5000000000` → `R$ 25,5000` (quatro casas, como o leiaute costuma trazer). */
export function formatarValorUnitario(valor: string | null | undefined, ausente = '—'): string {
  if (!valor || !DECIMAL.test(valor)) return valor?.trim() || ausente
  const { negativo, inteira, decimal } = partes(valor)
  const enxuta = decimal.replace(/0+$/, '')
  const casas = Math.max(2, Math.min(enxuta.length, 6))
  return `${negativo ? '-' : ''}R$ ${agrupar(inteira)},${comCasas(decimal, casas)}`
}

/** `18.0000` → `18%`; `1.6500` → `1,65%`. */
export function formatarPercentual(valor: string | null | undefined, ausente = '—'): string {
  if (!valor || !DECIMAL.test(valor)) return valor?.trim() || ausente
  return `${formatarQuantidade(valor)}%`
}

/** `2026-09-15` → `15/09/2026`, sem passar por fuso nenhum. */
export function formatarDataFiscal(data: string | null | undefined, ausente = '—'): string {
  if (!data) return ausente
  const [ano, mes, dia] = data.slice(0, 10).split('-')
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data
}

/** Instante de emissão como veio (`2026-09-15T10:20:30-03:00`) → `15/09/2026 10:20`. */
export function formatarInstanteFiscal(valor: Date | string | null | undefined, ausente = '—'): string {
  if (!valor) return ausente
  if (valor instanceof Date) {
    return `${formatarDataFiscal(valor.toISOString().slice(0, 10))} ${valor
      .toISOString()
      .slice(11, 16)}`
  }
  const data = formatarDataFiscal(valor)
  const hora = valor.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(hora) ? `${data} ${hora}` : data
}

/** `3526…0017` → blocos de quatro, como a chave é lida em voz alta. */
export function formatarChaveAcesso(chave: string | null | undefined, ausente = '—'): string {
  if (!chave) return ausente
  return chave.replace(/(.{4})/g, '$1 ').trim()
}
