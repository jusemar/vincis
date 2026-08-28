import { describe, expect, it } from 'vitest'
import {
  ANTECEDENCIA_CLIENTE_MINUTOS,
  ANTECEDENCIA_PRESTADOR_MINUTOS,
  LIMITE_MOTIVO_CANCELAMENTO,
} from '@/features/consultorias/constants/ciclo'
import {
  avaliarAlteracao,
  dentroDoPrazo,
  limiteDaAlteracao,
  normalizarMotivo,
} from '@/features/consultorias/lib/ciclo'

/**
 * Os prazos de cancelamento e remarcação, no relógio.
 *
 * Nada aqui toca banco: a regra é aritmética entre instantes, e é por isso que
 * pode ser cobrada segundo a segundo. O relógio é parâmetro — não `Date.now()`
 * disfarçado —, então o resultado não depende de quando nem onde o teste roda.
 */

/** `14:00` em São Paulo (UTC-3), escrito como instante absoluto. */
const INICIO = new Date('2026-09-10T17:00:00.000Z')
const AGENDADA = { inicioEm: INICIO, status: 'agendada' }

const em = (segundos: number) => new Date(INICIO.getTime() + segundos * 1000)

describe('prazo do Cliente — 2 horas', () => {
  it('o limite é exatamente duas horas antes do início', () => {
    expect(limiteDaAlteracao(INICIO, 'cliente').toISOString()).toBe(
      '2026-09-10T15:00:00.000Z',
    )
    expect(ANTECEDENCIA_CLIENTE_MINUTOS).toBe(120)
  })

  /**
   * A fronteira, segundo a segundo. O intervalo é **fechado**: quem clica no
   * segundo exato do prazo cumpriu o prazo.
   */
  it.each([
    ['2h00m01s antes', -7201, true],
    ['2h00m00s antes — o limite exato', -7200, true],
    ['1h59m59s antes', -7199, false],
    ['1h antes', -3600, false],
    ['no horário de início', 0, false],
    ['depois de começar', 60, false],
  ])('Cliente %s → %s', (_rotulo, deslocamento, esperado) => {
    expect(dentroDoPrazo(INICIO, 'cliente', em(deslocamento))).toBe(esperado)
  })
})

describe('prazo do Profissional — até começar', () => {
  it('o limite é o próprio início', () => {
    expect(limiteDaAlteracao(INICIO, 'prestador').toISOString()).toBe(
      INICIO.toISOString(),
    )
    expect(ANTECEDENCIA_PRESTADOR_MINUTOS).toBe(0)
  })

  it.each([
    ['1h59m antes — quando o Cliente já não pode', -7199, true],
    ['1 minuto antes', -60, true],
    ['no instante do início', 0, true],
    ['um segundo depois de começar', 1, false],
    ['no meio da consulta', 900, false],
  ])('Profissional %s → %s', (_rotulo, deslocamento, esperado) => {
    expect(dentroDoPrazo(INICIO, 'prestador', em(deslocamento))).toBe(esperado)
  })

  /**
   * A assimetria é intencional e vale a pena declarar num teste: existe uma
   * faixa de quase duas horas em que só o Profissional decide.
   */
  it('há uma faixa em que só o Profissional pode alterar', () => {
    const quaseNaHora = em(-1800) // 30 minutos antes
    expect(dentroDoPrazo(INICIO, 'cliente', quaseNaHora)).toBe(false)
    expect(dentroDoPrazo(INICIO, 'prestador', quaseNaHora)).toBe(true)
  })
})

describe('veredicto completo', () => {
  it('permite dentro do prazo', () => {
    expect(avaliarAlteracao(AGENDADA, 'cliente', em(-7200))).toEqual({ pode: true })
  })

  it('recusa fora do prazo, dizendo qual é a regra', () => {
    const r = avaliarAlteracao(AGENDADA, 'cliente', em(-3600))
    expect(r.pode).toBe(false)
    if (r.pode) return
    expect(r.motivo).toBe('fora_do_prazo')
    expect(r.mensagem).toMatch(/2 horas/)
  })

  /**
   * Cancelada vem antes do prazo de propósito: uma consultoria desfeita não tem
   * prazo a discutir, e responder "fora do prazo" mandaria a pessoa olhar o
   * relógio para um problema que não é de relógio.
   */
  it('cancelada responde cancelada, mesmo dentro do prazo', () => {
    const r = avaliarAlteracao(
      { inicioEm: INICIO, status: 'cancelada' },
      'cliente',
      em(-86_400),
    )
    expect(r.pode).toBe(false)
    if (r.pode) return
    expect(r.motivo).toBe('ja_cancelada')
  })

  it('não depende do fuso do processo', () => {
    const original = process.env.TZ
    const vistos = new Set<boolean>()
    for (const fuso of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
      process.env.TZ = fuso
      vistos.add(avaliarAlteracao(AGENDADA, 'cliente', em(-7200)).pode)
    }
    process.env.TZ = original
    expect([...vistos]).toEqual([true])
  })
})

describe('motivo', () => {
  it('espaço em branco não é motivo', () => {
    expect(normalizarMotivo('   ')).toBeNull()
    expect(normalizarMotivo('')).toBeNull()
    expect(normalizarMotivo(null)).toBeNull()
    expect(normalizarMotivo(undefined)).toBeNull()
  })

  it('normaliza espaços e corta no limite do servidor', () => {
    expect(normalizarMotivo('  surgiu   um   imprevisto  ')).toBe(
      'surgiu um imprevisto',
    )
    const gigante = 'a'.repeat(LIMITE_MOTIVO_CANCELAMENTO + 500)
    expect(normalizarMotivo(gigante)).toHaveLength(LIMITE_MOTIVO_CANCELAMENTO)
  })
})
