import {
  dataLocalDe,
  diasNoMes,
  somarMeses,
} from '@/features/consultorias/lib/mes'
import { type DataLocal, dataLocalValida } from '@/features/consultorias/lib/tempo'

/**
 * O período de cada mês de prestação, por calendário de verdade.
 *
 * ## Por que não `+30 dias`
 *
 * Trinta dias não são um mês. Um contrato que começa em 31 de janeiro somando
 * trinta dias terminaria o ano em outro dia do mês, deslizando um pouco a cada
 * volta. Aqui cada mês é contado **a partir do dia original**: a competência 2
 * começa no "dia 31" de fevereiro — que não existe, então é o último dia de
 * fevereiro —, e a competência 3 volta ao dia 31 de março. O dia escorregar num
 * mês curto não contamina os meses seguintes.
 *
 * ## Contíguo, sem buraco e sem sobreposição
 *
 * Cada competência termina no dia anterior ao começo da próxima. Somados, os
 * meses cobrem o contrato inteiro exatamente uma vez.
 *
 * ## Datas sem fuso
 *
 * Tudo em `AAAA-MM-DD`, pelo mesmo calendário puro da agenda: nada aqui passa
 * por `new Date('2026-01-31')`, que é meia-noite UTC e, em São Paulo, já é o dia
 * anterior. A conversão do instante do pagamento para a data local acontece
 * antes, uma vez, com o fuso explícito.
 */

export type PeriodoDaCompetencia = { inicio: DataLocal; fim: DataLocal }

function partes(data: DataLocal) {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia }
}

function exigirData(data: DataLocal) {
  if (!dataLocalValida(data)) {
    throw new Error(`Data de início inválida: ${data}`)
  }
}

function exigirNumero(numero: number) {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error('A competência começa em 1.')
  }
}

/** O primeiro dia da competência `numero`, ancorado no dia do início. */
export function inicioDaCompetencia(
  inicioDoContrato: DataLocal,
  numero: number,
): DataLocal {
  exigirData(inicioDoContrato)
  exigirNumero(numero)
  const { ano, mes, dia } = partes(inicioDoContrato)
  const alvo = somarMeses({ ano, mes }, numero - 1)
  // Dia que o mês não tem vira o último dia dele — só neste mês.
  const diaNoAlvo = Math.min(dia, diasNoMes(alvo.ano, alvo.mes))
  return dataLocalDe(alvo.ano, alvo.mes, diaNoAlvo)
}

/** A véspera de uma data local, pela aritmética de calendário. */
function vespera(data: DataLocal): DataLocal {
  const { ano, mes, dia } = partes(data)
  const anterior = new Date(Date.UTC(ano, mes - 1, dia - 1))
  return dataLocalDe(
    anterior.getUTCFullYear(),
    anterior.getUTCMonth() + 1,
    anterior.getUTCDate(),
  )
}

/** Primeiro e último dia (inclusive) da competência `numero`. */
export function periodoDaCompetencia(
  inicioDoContrato: DataLocal,
  numero: number,
): PeriodoDaCompetencia {
  return {
    inicio: inicioDaCompetencia(inicioDoContrato, numero),
    fim: vespera(inicioDaCompetencia(inicioDoContrato, numero + 1)),
  }
}
