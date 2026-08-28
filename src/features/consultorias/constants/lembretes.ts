/**
 * Os lembretes da consultoria.
 *
 * ## Por que faixas, e não instantes
 *
 * Um cron não roda em `24h00m00s` antes — roda de tempos em tempos. Se o
 * lembrete exigisse o instante exato, ele simplesmente nunca sairia. Cada tipo
 * tem então uma **faixa** de tempo restante, e o lembrete é emitido no primeiro
 * disparo que cair dentro dela.
 *
 * ## Por que as faixas são contíguas e não se sobrepõem
 *
 * Contíguas para não haver buraco: todo instante entre o agendamento e o início
 * pertence a exatamente uma faixa, então nenhum lembrete se perde por cair
 * "entre" duas. Sem sobreposição para não haver dois: uma consultoria marcada
 * com 40 minutos de antecedência recebe o lembrete de 1 hora e **não** o de 24
 * horas, porque 40 minutos nunca esteve na faixa das 24 horas.
 *
 * ## Por que os limites têm folga
 *
 * `25h` e não `24h`, `75min` e não `60min`, `12min` e não `10min`. A folga é o
 * que garante que um disparo caia dentro da faixa mesmo com o cron atrasado.
 * A faixa mais estreita é a de 12 minutos — e é ela que define a frequência
 * mínima do cron.
 */

export const TIPOS_LEMBRETE = ['24h', '1h', '10min'] as const
export type TipoLembrete = (typeof TIPOS_LEMBRETE)[number]

const MINUTO = 60_000

/**
 * O teto de cada faixa, em milissegundos de tempo restante.
 *
 * O piso de cada faixa é o teto da seguinte — daí a contiguidade. A última
 * termina em zero: consultoria que já começou não recebe lembrete nenhum, e
 * avisar alguém de algo que começou seria pior do que não avisar.
 */
export const TETO_DA_FAIXA: Record<TipoLembrete, number> = {
  '24h': 25 * 60 * MINUTO,
  '1h': 75 * MINUTO,
  '10min': 12 * MINUTO,
}

/** O intervalo máximo entre disparos para nenhuma faixa ser pulada. */
export const INTERVALO_MAXIMO_DO_CRON_MINUTOS = 12

/**
 * A qual faixa pertence um tempo restante — ou nenhuma.
 *
 * `null` para quem já começou (restante <= 0) e para quem ainda está longe
 * demais (acima do teto de 24h). As faixas são meio-abertas `(piso, teto]`, a
 * mesma convenção que a janela da videochamada e o gerador de slots usam.
 */
export function faixaDoRestante(restanteMs: number): TipoLembrete | null {
  if (restanteMs <= 0) return null
  if (restanteMs <= TETO_DA_FAIXA['10min']) return '10min'
  if (restanteMs <= TETO_DA_FAIXA['1h']) return '1h'
  if (restanteMs <= TETO_DA_FAIXA['24h']) return '24h'
  return null
}
