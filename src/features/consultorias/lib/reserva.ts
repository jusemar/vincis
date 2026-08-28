import { HOLD_CONSULTORIA_MINUTOS } from '../constants/reserva'

const MS_POR_MINUTO = 60_000

/**
 * As contas da reserva temporária, sem banco e sem React.
 *
 * Tudo aqui é função pura de instantes: o módulo nunca olha o relógio sozinho,
 * `agora` sempre entra de fora. É a mesma disciplina de `lib/slots.ts`, e pelo
 * mesmo motivo — uma suíte que depende da hora da máquina passa hoje e falha na
 * virada do horário de verão.
 */

/** Quando uma reserva adquirida agora deixa de valer. */
export function expiracaoDe(
  agora: Date,
  minutos: number = HOLD_CONSULTORIA_MINUTOS,
): Date {
  return new Date(agora.getTime() + minutos * MS_POR_MINUTO)
}

/**
 * A reserva ainda segura o horário?
 *
 * Duas condições, e as duas obrigatórias. `status` sozinho mente: uma reserva
 * vencida continua `ativa` no banco até alguém varrer. `expira_em` sozinho
 * também: uma reserva liberada porque o Cliente trocou de horário não deve
 * bloquear nada, mesmo com prazo no futuro.
 */
export function reservaValida(
  reserva: { status: string; expiraEm: Date },
  agora: Date,
): boolean {
  return reserva.status === 'ativa' && reserva.expiraEm.getTime() > agora.getTime()
}

/** Segundos que faltam. Nunca negativo — zero significa "acabou". */
export function restanteEmSegundos(expiraEm: Date, agora: Date): number {
  const restante = Math.ceil((expiraEm.getTime() - agora.getTime()) / 1000)
  return restante > 0 ? restante : 0
}

/** `09:42`. Só formatação: quem decide se expirou é o servidor. */
export function formatarRestante(segundos: number): string {
  const seguros = Math.max(0, Math.floor(segundos))
  const minutos = Math.floor(seguros / 60)
  const resto = seguros % 60
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * Dois períodos brigam pelo mesmo espaço na agenda?
 *
 * Esta é a regra do conflito, e ela **não** é "mesmo horário de início":
 * 14:00–15:00 e 14:30–15:30 são horários diferentes e conflito igual. A
 * comparação é de intervalos, com a folga entre consultas somada dos dois
 * lados — encostar numa reserva existente sem respeitar o buffer não é horário
 * livre.
 *
 * É a mesma expressão que `calcularSlotsDoDia` aplica às ocupações. Duas
 * versões desta conta é como o calendário passa a oferecer um horário que a
 * reserva recusa.
 */
export function periodosConflitam(
  a: { inicioEm: Date; fimEm: Date },
  b: { inicioEm: Date; fimEm: Date },
  folgaMinutos: number,
): boolean {
  const folga = Math.max(0, folgaMinutos) * MS_POR_MINUTO
  return (
    a.inicioEm.getTime() < b.fimEm.getTime() + folga &&
    a.fimEm.getTime() + folga > b.inicioEm.getTime()
  )
}

/**
 * As bordas que a consulta SQL de conflito usa.
 *
 * A mesma desigualdade de `periodosConflitam`, reescrita como duas
 * comparações simples para que o banco possa resolvê-las com índice:
 * `inicio_em < limiteSuperior AND fim_em > limiteInferior`.
 */
export function bordasDeConflito(
  periodo: { inicioEm: Date; fimEm: Date },
  folgaMinutos: number,
): { limiteInferior: Date; limiteSuperior: Date } {
  const folga = Math.max(0, folgaMinutos) * MS_POR_MINUTO
  return {
    limiteInferior: new Date(periodo.inicioEm.getTime() - folga),
    limiteSuperior: new Date(periodo.fimEm.getTime() + folga),
  }
}
