import { ROTULO_DIA_SEMANA } from '../constants/consultoria'
import { minutosDeHora } from './tempo'

/**
 * A regra que impede uma agenda contraditória.
 *
 * Segunda das 09:00 às 12:00 **e** das 11:00 às 14:00 não é "duas faixas": é
 * uma faixa escrita duas vezes com discordância no meio, e o cálculo de slots
 * teria de escolher uma interpretação sozinho. Melhor recusar na entrada.
 *
 * Puro de propósito — a mesma função valida no Zod (antes de tocar o banco) e
 * dentro da transação da Server Action (depois de travar a configuração). São
 * dois momentos diferentes da mesma regra, e uma regra só.
 */

export type FaixaSemanal = {
  diaSemana: number
  horaInicio: string
  horaFim: string
}

export type ProblemaNaFaixa = {
  indice: number
  mensagem: string
}

/**
 * Devolve o primeiro problema de cada faixa, ou lista vazia quando o conjunto
 * é coerente. Faixas de dias diferentes nunca conflitam entre si.
 */
export function conferirFaixasSemanais(
  faixas: FaixaSemanal[],
): ProblemaNaFaixa[] {
  const problemas: ProblemaNaFaixa[] = []

  const emMinutos = faixas.map((faixa, indice) => ({
    indice,
    diaSemana: faixa.diaSemana,
    inicio: minutosDeHora(faixa.horaInicio),
    fim: minutosDeHora(faixa.horaFim),
  }))

  for (const faixa of emMinutos) {
    if (Number.isNaN(faixa.inicio) || Number.isNaN(faixa.fim)) {
      problemas.push({
        indice: faixa.indice,
        mensagem: 'Informe horários válidos no formato HH:MM.',
      })
      continue
    }
    if (faixa.inicio >= faixa.fim) {
      problemas.push({
        indice: faixa.indice,
        mensagem: 'O horário final precisa ser maior que o inicial.',
      })
    }
  }
  if (problemas.length) return problemas

  // Comparação por dia, e cada par uma vez só: a lista tem no máximo algumas
  // dezenas de faixas, e ordenar para varrer em O(n) trocaria clareza por um
  // ganho que ninguém mediria.
  for (let i = 0; i < emMinutos.length; i += 1) {
    for (let j = i + 1; j < emMinutos.length; j += 1) {
      const a = emMinutos[i]
      const b = emMinutos[j]
      if (a.diaSemana !== b.diaSemana) continue
      // Faixas coladas (12:00 e 12:00) não se sobrepõem: o fim é exclusivo.
      if (a.inicio < b.fim && b.inicio < a.fim) {
        problemas.push({
          indice: b.indice,
          mensagem: `Este período se sobrepõe a outro de ${ROTULO_DIA_SEMANA[b.diaSemana] ?? 'mesmo dia'}.`,
        })
      }
    }
  }

  return problemas
}
