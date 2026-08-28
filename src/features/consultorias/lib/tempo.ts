/**
 * Tempo da agenda: data local, hora de parede e instante UTC.
 *
 * ## Por que este arquivo existe
 *
 * Agenda é o primeiro domínio da Vincis genuinamente sensível a fuso, e os
 * erros clássicos aqui são silenciosos: `new Date('2026-08-27')` produz
 * meia-noite **UTC**, que em `America/Sao_Paulo` é 21:00 do dia 26 — a data
 * inteira anda para trás sem nenhum erro na tela. Nada neste módulo aceita esse
 * atalho: a data local é sempre uma string `AAAA-MM-DD`, a hora local é sempre
 * um inteiro de minutos desde a meia-noite, e a conversão entre isso e um
 * instante só acontece com um fuso IANA explícito na mão.
 *
 * ## Sem dependência nova
 *
 * `Intl.DateTimeFormat` com `timeZone` já resolve o problema inteiro e vem com
 * o Node — inclusive a base IANA, que é o que realmente importa numa conversão
 * dessas. `date-fns` está no projeto mas não é usado em nenhum arquivo de
 * `src/`, e a parte dele que faria este trabalho (`@date-fns/tz`) não está
 * declarada em `package.json`. Instalar biblioteca para reescrever o que a
 * plataforma já faz seria custo sem ganho.
 *
 * Todas as funções são **puras**: nada aqui lê banco, sessão ou relógio por
 * conta própria. O instante "agora" sempre entra por parâmetro, e é isso que
 * torna a agenda inteira testável sem congelar o relógio do processo.
 */

const MS_POR_MINUTO = 60_000
export const MINUTOS_POR_DIA = 1_440

/** `AAAA-MM-DD` — uma data no calendário do Profissional, sem hora e sem fuso. */
export type DataLocal = string

const FORMATO_DATA_LOCAL = /^\d{4}-\d{2}-\d{2}$/
const FORMATO_HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/

/** Este identificador IANA existe nesta plataforma? */
export function timezoneValido(timezone: string): boolean {
  if (!timezone.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    // `RangeError` é a resposta do próprio Intl para fuso desconhecido. Não há
    // lista para conferir: quem sabe quais fusos existem é a base do runtime.
    return false
  }
}

/** A string está no formato de data local aceito? */
export function dataLocalValida(data: string): boolean {
  if (!FORMATO_DATA_LOCAL.test(data)) return false
  const [ano, mes, dia] = data.split('-').map(Number)
  const referencia = new Date(Date.UTC(ano, mes - 1, dia))
  // Rejeita 31/02 e afins: o `Date.UTC` normaliza em silêncio, e comparar de
  // volta é o que revela a normalização.
  return (
    referencia.getUTCFullYear() === ano &&
    referencia.getUTCMonth() === mes - 1 &&
    referencia.getUTCDate() === dia
  )
}

const formatadores = new Map<string, Intl.DateTimeFormat>()

function formatador(timezone: string) {
  let existente = formatadores.get(timezone)
  if (!existente) {
    existente = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatadores.set(timezone, existente)
  }
  return existente
}

type PartesLocais = {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
  segundo: number
}

/** Como este instante aparece no relógio de parede daquele fuso. */
function partesNoFuso(instante: Date, timezone: string): PartesLocais {
  const partes = formatador(timezone).formatToParts(instante)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? '0')
  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  }
}

/**
 * Deslocamento do fuso, em minutos, **naquele instante**.
 *
 * Positivo a leste de Greenwich. Depende do instante de propósito: o mesmo fuso
 * vale -03:00 em janeiro e -02:00 em julho onde há horário de verão, e usar um
 * número fixo é como o horário de uma consulta muda sozinha uma vez por ano.
 */
export function deslocamentoMinutos(instante: Date, timezone: string): number {
  const p = partesNoFuso(instante, timezone)
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
  return Math.round((comoUtc - instante.getTime()) / MS_POR_MINUTO)
}

/**
 * Hora de parede → instante.
 *
 * Duas passadas, e não uma: a primeira estimativa usa o deslocamento do
 * instante errado (o "como se fosse UTC"), o que erra por uma hora exatamente
 * na virada do horário de verão. A segunda passada recalcula o deslocamento já
 * no instante estimado e converge — é o mesmo laço que qualquer biblioteca de
 * fuso faz por dentro.
 *
 * Horário inexistente (a hora que o relógio pula na entrada do horário de
 * verão) não tem instante correspondente; o resultado cai no minuto adjacente
 * real. Quem precisa saber se aquela hora existe pergunta a `horaLocalExiste`.
 */
export function instanteDeLocal(
  dataLocal: DataLocal,
  minutosDoDia: number,
  timezone: string,
): Date {
  const [ano, mes, dia] = dataLocal.split('-').map(Number)
  const comoUtc =
    Date.UTC(ano, mes - 1, dia, 0, 0, 0) + minutosDoDia * MS_POR_MINUTO

  const primeira = new Date(
    comoUtc - deslocamentoMinutos(new Date(comoUtc), timezone) * MS_POR_MINUTO,
  )
  return new Date(
    comoUtc - deslocamentoMinutos(primeira, timezone) * MS_POR_MINUTO,
  )
}

/** Aquela hora de parede realmente aconteceu naquele dia, naquele fuso? */
export function horaLocalExiste(
  dataLocal: DataLocal,
  minutosDoDia: number,
  timezone: string,
): boolean {
  const instante = instanteDeLocal(dataLocal, minutosDoDia, timezone)
  return (
    dataLocalDoInstante(instante, timezone) === dataLocal &&
    minutosLocaisDoInstante(instante, timezone) === minutosDoDia % MINUTOS_POR_DIA
  )
}

/** Em que dia do calendário daquele fuso este instante caiu. */
export function dataLocalDoInstante(
  instante: Date,
  timezone: string,
): DataLocal {
  const p = partesNoFuso(instante, timezone)
  return `${String(p.ano).padStart(4, '0')}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/** Que horas do relógio de parede eram, em minutos desde a meia-noite. */
export function minutosLocaisDoInstante(
  instante: Date,
  timezone: string,
): number {
  const p = partesNoFuso(instante, timezone)
  return p.hora * 60 + p.minuto
}

/**
 * Dia da semana de uma data local: 0 = domingo … 6 = sábado.
 *
 * Calculado sobre a data pura, com `Date.UTC`, e por isso independente de fuso:
 * 27/08/2026 é uma quinta-feira em qualquer lugar do mundo.
 */
export function diaDaSemanaDeDataLocal(dataLocal: DataLocal): number {
  const [ano, mes, dia] = dataLocal.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
}

/** Aritmética de calendário, sem passar por instante nenhum. */
export function somarDiasEmDataLocal(
  dataLocal: DataLocal,
  dias: number,
): DataLocal {
  const [ano, mes, dia] = dataLocal.split('-').map(Number)
  const movida = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return dataLocalDoInstante(movida, 'UTC')
}

/** Quantos dias de calendário separam duas datas locais (`ate - de`). */
export function diferencaEmDiasLocais(de: DataLocal, ate: DataLocal): number {
  const [a1, m1, d1] = de.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) /
      (MINUTOS_POR_DIA * MS_POR_MINUTO),
  )
}

/** Todas as datas locais de `de` até `ate`, inclusive nas duas pontas. */
export function intervaloDeDatasLocais(
  de: DataLocal,
  ate: DataLocal,
): DataLocal[] {
  const total = diferencaEmDiasLocais(de, ate)
  if (total < 0) return []
  return Array.from({ length: total + 1 }, (_, indice) =>
    somarDiasEmDataLocal(de, indice),
  )
}

/**
 * `HH:MM` ou `HH:MM:SS` → minutos desde a meia-noite.
 *
 * Aceita os dois formatos porque a coluna `time` do Postgres volta com segundos
 * e o formulário manda sem. Os segundos são descartados: a agenda trabalha em
 * minutos, e meio minuto de faixa não é uma decisão que alguém queira tomar.
 */
export function minutosDeHora(hora: string): number {
  const partes = FORMATO_HORA.exec(hora.trim())
  if (!partes) return Number.NaN
  const horas = Number(partes[1])
  const minutos = Number(partes[2])
  if (horas > 23 || minutos > 59) return Number.NaN
  return horas * 60 + minutos
}

/** Minutos desde a meia-noite → `HH:MM`. O formato que a tela exibe. */
export function horaDeMinutos(minutos: number): string {
  const normalizado = ((minutos % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA
  const horas = Math.floor(normalizado / 60)
  return `${String(horas).padStart(2, '0')}:${String(normalizado % 60).padStart(2, '0')}`
}

/** `HH:MM` → `HH:MM:00`, o formato que a coluna `time` recebe. */
export function horaParaColuna(hora: string): string {
  return `${horaDeMinutos(minutosDeHora(hora))}:00`
}
