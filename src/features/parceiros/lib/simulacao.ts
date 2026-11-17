import { PERCENTUAL_AVULSO } from '../constants/programa'
import { calcularComissaoCentavos, calcularComissaoPorCentesimos, nivelPorMinimoDeClientes } from './calculo'

/**
 * O simulador da página pública — puro, sem banco, sem estado de tela.
 *
 * ## Duas modalidades, duas fórmulas
 *
 * - **Recorrente:** cada mês de assinatura de um plano Vincis, prestado e pago,
 *   gera comissão pelo percentual do nível do parceiro. O nível vem da
 *   quantidade de **clientes recorrentes ativos** — não de "indicações". O
 *   motor calcula uma comissão por cliente por mês, com arredondamento por
 *   competência; o simulador repete exatamente isso (por cliente, depois soma).
 * - **Avulsa:** um serviço do catálogo contratado e pago pela plataforma gera
 *   `PERCENTUAL_AVULSO` do valor, independentemente do nível.
 *
 * As duas nunca se misturam numa fórmula.
 *
 * ## O que não está aqui
 *
 * Proteção contra queda de nível: é histórico de quem já é parceiro. A simulação
 * é de entrada — o nível é o que a quantidade informada alcança hoje.
 */

export type NivelSimulavel = {
  codigo: string
  nome: string
  minimoClientes: number
  /** 500 = 5%. */
  percentualCentesimos: number
}

export const LIMITES_SIMULACAO = {
  clientesMax: 200,
  mensalidadeMaxCentavos: 10_000_00,
  mesesMax: 12,
  servicoMaxCentavos: 100_000_00,
  contratacoesMax: 100,
} as const

const inteiroEntre = (valor: number, min: number, max: number) =>
  Number.isFinite(valor) ? Math.min(max, Math.max(min, Math.round(valor))) : min

export type ResultadoRecorrente = {
  nivel: NivelSimulavel
  proximo: { nivel: NivelSimulavel; faltamClientes: number } | null
  comissaoPorClienteCentavos: number
  mensalCentavos: number
  meses: number
  acumuladoCentavos: number
}

export function simularRecorrente(
  niveis: readonly NivelSimulavel[],
  entrada: { clientesAtivos: number; mensalidadeCentavos: number; meses: number },
): ResultadoRecorrente | null {
  if (!niveis.length) return null
  const clientes = inteiroEntre(entrada.clientesAtivos, 0, LIMITES_SIMULACAO.clientesMax)
  const mensalidade = inteiroEntre(entrada.mensalidadeCentavos, 0, LIMITES_SIMULACAO.mensalidadeMaxCentavos)
  const meses = inteiroEntre(entrada.meses, 1, LIMITES_SIMULACAO.mesesMax)

  const nivel = nivelPorMinimoDeClientes(niveis, clientes)
  const indice = niveis.indexOf(nivel)
  const seguinte = niveis[indice + 1]
  const porCliente = calcularComissaoPorCentesimos(mensalidade, nivel.percentualCentesimos)
  const mensal = porCliente * clientes

  return {
    nivel,
    proximo: seguinte ? { nivel: seguinte, faltamClientes: seguinte.minimoClientes - clientes } : null,
    comissaoPorClienteCentavos: porCliente,
    mensalCentavos: mensal,
    meses,
    acumuladoCentavos: mensal * meses,
  }
}

export type ResultadoAvulso = {
  percentual: number
  porContratacaoCentavos: number
  quantidade: number
  totalCentavos: number
}

export function simularAvulso(entrada: { valorServicoCentavos: number; quantidade: number }): ResultadoAvulso {
  const valor = inteiroEntre(entrada.valorServicoCentavos, 0, LIMITES_SIMULACAO.servicoMaxCentavos)
  const quantidade = inteiroEntre(entrada.quantidade, 0, LIMITES_SIMULACAO.contratacoesMax)
  const porContratacao = calcularComissaoCentavos(valor, PERCENTUAL_AVULSO)
  return { percentual: PERCENTUAL_AVULSO, porContratacaoCentavos: porContratacao, quantidade, totalCentavos: porContratacao * quantidade }
}

/** "R$ 1.234,56" — sempre com centavos (é dinheiro de comissão). */
export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Texto digitado ("1.234,50", "450") em centavos; vazio ou inválido = 0. */
export function lerReaisEmCentavos(texto: string): number {
  const limpo = texto.replace(/[^\d,]/g, '')
  if (!limpo) return 0
  const [reais, cent = ''] = limpo.split(',')
  const total = Number(reais || '0') * 100 + Number(cent.slice(0, 2).padEnd(2, '0'))
  return Number.isSafeInteger(total) ? total : 0
}
