import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  minutosDeHora,
  minutosLocaisDoInstante,
} from './tempo'

/**
 * As consultas já marcadas que a nova agenda deixaria de fora.
 *
 * ## Por que isto existe
 *
 * Porque mudar a disponibilidade e desmarcar clientes são coisas diferentes, e
 * a tela não pode confundi-las. Quando o Profissional tira a segunda-feira de
 * manhã da agenda, ele está dizendo "não quero **novas** consultas nesse
 * horário" — não "cancele as que já vendi". A plataforma não tem o direito de
 * interpretar a segunda coisa a partir da primeira.
 *
 * Então nada é apagado: esta função apenas **encontra** os compromissos que
 * ficariam fora do novo horário de trabalho, para a tela poder mostrá-los antes
 * de salvar. O Profissional decide com a informação na mão — ajusta a faixa, ou
 * confirma sabendo que aquelas consultas continuam de pé e precisam ser
 * honradas (ou desmarcadas uma a uma, pelo caminho que já existe para isso).
 *
 * ## Por que a comparação é em horário local
 *
 * Porque a faixa é "segunda, das 09:00 às 12:00" — uma regra de parede, não um
 * instante. A consulta, ao contrário, é um instante absoluto. Traduzir o
 * instante para o fuso da agenda é o único jeito de perguntar "isto cai dentro
 * da segunda de manhã?" sem errar por causa do fuso do servidor.
 */

export type FaixaDaSemana = {
  diaSemana: number
  horaInicio: string
  horaFim: string
}

/** Um dia inteiro fora do ar — férias, feriado, viagem. */
export type DiaBloqueado = { data: string }

export type ConsultaMarcada = {
  id: string
  inicioEm: Date
  fimEm: Date
  /** Só para a tela conseguir nomear o conflito. */
  clienteNome?: string
  protocolo?: string | null
}

export type ConflitoDeAgenda = {
  consultaId: string
  /** `AAAA-MM-DD` no fuso da agenda. */
  data: string
  inicio: string
  fim: string
  clienteNome?: string
  protocolo?: string | null
  motivo: 'fora_das_faixas' | 'dia_bloqueado'
}

function horaLocal(minutos: number) {
  const h = Math.floor(minutos / 60)
  return `${String(h).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}

/**
 * A consulta cabe inteira dentro de alguma faixa daquele dia da semana?
 *
 * "Inteira" de propósito: uma consulta das 11:30 às 12:30 numa faixa que
 * termina às 12:00 **é** conflito. Ela invade meia hora que o Profissional
 * acabou de declarar indisponível, e tratá-la como coberta porque começa dentro
 * da faixa esconderia exatamente o problema que ele precisa ver.
 */
function cabeEmAlgumaFaixa(
  inicioMin: number,
  fimMin: number,
  faixasDoDia: FaixaDaSemana[],
): boolean {
  return faixasDoDia.some(
    (faixa) =>
      inicioMin >= minutosDeHora(faixa.horaInicio) &&
      fimMin <= minutosDeHora(faixa.horaFim),
  )
}

export function encontrarConflitosDeAgenda({
  consultas,
  faixas,
  diasBloqueados = [],
  timezone,
}: {
  consultas: ConsultaMarcada[]
  faixas: FaixaDaSemana[]
  diasBloqueados?: DiaBloqueado[]
  timezone: string
}): ConflitoDeAgenda[] {
  const bloqueados = new Set(diasBloqueados.map((d) => d.data))
  const conflitos: ConflitoDeAgenda[] = []

  for (const consulta of consultas) {
    const data = dataLocalDoInstante(consulta.inicioEm, timezone)
    const inicioMin = minutosLocaisDoInstante(consulta.inicioEm, timezone)
    const fimMin = minutosLocaisDoInstante(consulta.fimEm, timezone)

    const comum = {
      consultaId: consulta.id,
      data,
      inicio: horaLocal(inicioMin),
      fim: horaLocal(fimMin),
      clienteNome: consulta.clienteNome,
      protocolo: consulta.protocolo,
    }

    // O bloqueio vem primeiro: um dia fora do ar não precisa discutir faixas.
    if (bloqueados.has(data)) {
      conflitos.push({ ...comum, motivo: 'dia_bloqueado' })
      continue
    }

    const doDia = faixas.filter((f) => f.diaSemana === diaDaSemanaDeDataLocal(data))
    if (!cabeEmAlgumaFaixa(inicioMin, fimMin, doDia)) {
      conflitos.push({ ...comum, motivo: 'fora_das_faixas' })
    }
  }

  return conflitos
}

/**
 * Todas as datas de um intervalo, inclusive as duas pontas.
 *
 * Um bloqueio de 10 a 12 cobre 10, 11 e 12 — quem tira férias não volta na
 * manhã do último dia. O laço anda por data local, não somando 24 horas a um
 * instante, porque em fusos com horário de verão um dia pode ter 23 ou 25.
 */
export function datasDoIntervalo(de: string, ate: string): string[] {
  const datas: string[] = []
  const [ai, mi, di] = de.split('-').map(Number)
  const limite = ate
  const cursor = new Date(Date.UTC(ai, mi - 1, di))

  // Teto de segurança: um intervalo absurdo é erro de entrada, não uma agenda.
  for (let i = 0; i < 400; i += 1) {
    const atual = cursor.toISOString().slice(0, 10)
    datas.push(atual)
    if (atual >= limite) break
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return datas
}
