import {
  type DataLocal,
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
} from './tempo'

/**
 * A grade de um mês, montada sem passar por instante nenhum.
 *
 * O calendário do perfil desenha sete colunas começando no domingo. O que ele
 * precisa saber é: quantas células vazias vêm antes do dia 1, e quais são as
 * datas do mês. As duas respostas saem de aritmética de calendário pura — nada
 * aqui usa `new Date('2026-08-01')`, que produziria meia-noite UTC e, num fuso
 * a oeste, começaria o mês no dia 31 do mês anterior.
 *
 * Módulo puro e sem Drizzle: roda no servidor e no navegador, e é o mesmo
 * cálculo nos dois lados.
 */

export type MesDaAgenda = { ano: number; mes: number }

export type GradeDoMes = {
  ano: number
  /** 1–12. Mês humano, não o índice do `Date`. */
  mes: number
  /** "Agosto 2026" — o mesmo formato que o card já exibia. */
  rotulo: string
  /** Células vazias antes do dia 1. Domingo = 0. */
  vazias: number
  dias: DataLocal[]
  primeiroDia: DataLocal
  ultimoDia: DataLocal
}

function doisDigitos(valor: number) {
  return String(valor).padStart(2, '0')
}

/** `AAAA-MM-DD` a partir das partes, sem tocar em fuso. */
export function dataLocalDe(ano: number, mes: number, dia: number): DataLocal {
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`
}

/**
 * Quantos dias tem o mês.
 *
 * `Date.UTC(ano, mes, 0)` é o último dia do mês anterior ao índice — ou seja, o
 * último dia do mês pedido. Fevereiro de ano bissexto sai correto sem regra
 * escrita à mão.
 */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Mês em que uma data local cai. */
export function mesDaData(data: DataLocal): MesDaAgenda {
  const [ano, mes] = data.split('-').map(Number)
  return { ano, mes }
}

/** O mês corrente na agenda do Profissional — no fuso dela, não no do visitante. */
export function mesDoInstante(instante: Date, timezone: string): MesDaAgenda {
  return mesDaData(dataLocalDoInstante(instante, timezone))
}

/** Move o mês, virando o ano quando precisa. */
export function somarMeses({ ano, mes }: MesDaAgenda, passos: number): MesDaAgenda {
  const total = ano * 12 + (mes - 1) + passos
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 }
}

/** Ordem cronológica entre dois meses: negativo, zero ou positivo. */
export function compararMeses(a: MesDaAgenda, b: MesDaAgenda): number {
  return a.ano * 12 + a.mes - (b.ano * 12 + b.mes)
}

/**
 * Rótulo do cabeçalho, em pt-BR e com a inicial maiúscula.
 *
 * `Intl` devolve "agosto de 2026"; o card sempre exibiu "Agosto 2026". O nome
 * do mês vem do `Intl` (nunca de um array escrito à mão) e a montagem
 * preserva o texto que a tela já mostrava.
 */
export function rotuloDoMes({ ano, mes }: MesDaAgenda): string {
  const nome = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(ano, mes - 1, 1)))
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`
}

export function montarGradeDoMes({ ano, mes }: MesDaAgenda): GradeDoMes {
  const total = diasNoMes(ano, mes)
  const primeiroDia = dataLocalDe(ano, mes, 1)
  const dias = Array.from({ length: total }, (_, indice) =>
    dataLocalDe(ano, mes, indice + 1),
  )
  return {
    ano,
    mes,
    rotulo: rotuloDoMes({ ano, mes }),
    vazias: diaDaSemanaDeDataLocal(primeiroDia),
    dias,
    primeiroDia,
    ultimoDia: dataLocalDe(ano, mes, total),
  }
}

/**
 * Os meses que o Cliente pode alcançar.
 *
 * Do mês corrente da agenda até o mês em que o horizonte da consultoria acaba.
 * Não existe navegação para trás além de hoje — não há o que agendar no passado
 * — nem para frente além do horizonte, que é o limite que o Profissional
 * configurou.
 */
export function limitesDeNavegacao(
  hojeLocal: DataLocal,
  ultimoDiaDoHorizonte: DataLocal,
): { minimo: MesDaAgenda; maximo: MesDaAgenda } {
  return { minimo: mesDaData(hojeLocal), maximo: mesDaData(ultimoDiaDoHorizonte) }
}
