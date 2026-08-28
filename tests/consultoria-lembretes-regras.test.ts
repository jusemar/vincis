import { describe, expect, it } from 'vitest'
import {
  faixaDoRestante,
  INTERVALO_MAXIMO_DO_CRON_MINUTOS,
  TETO_DA_FAIXA,
  TIPOS_LEMBRETE,
} from '@/features/consultorias/constants/lembretes'
import { chaveDoLembrete, textoDoLembrete } from '@/features/consultorias/lib/lembretes'
import { MINUTOS_ANTES_DA_CONSULTORIA } from '@/features/videochamada/constants/videochamada'

/**
 * As faixas dos lembretes, no relógio.
 *
 * Sem banco e sem rede: a regra é aritmética sobre o tempo restante. O que
 * precisa ser provado é que as faixas cobrem tudo (nenhum lembrete se perde),
 * não se sobrepõem (nenhum sai duas vezes) e que o texto nunca afirma o que não
 * é verdade.
 */

const MINUTO = 60_000
const FUSO = 'America/Sao_Paulo'
/** `14:00` em São Paulo, escrito como instante. */
const INICIO = new Date('2026-09-10T17:00:00.000Z')
const FIM = new Date('2026-09-10T18:00:00.000Z')

describe('faixas', () => {
  it.each([
    ['26 horas — longe demais', 26 * 60, null],
    ['25 horas — o teto da faixa de 24h', 25 * 60, '24h'],
    ['24 horas', 24 * 60, '24h'],
    ['2 horas', 120, '24h'],
    ['76 minutos', 76, '24h'],
    ['75 minutos — o teto da faixa de 1h', 75, '1h'],
    ['60 minutos', 60, '1h'],
    ['13 minutos', 13, '1h'],
    ['12 minutos — o teto da faixa de 10min', 12, '10min'],
    ['10 minutos', 10, '10min'],
    ['1 minuto', 1, '10min'],
  ])('restando %s → %s', (_r, minutos, esperado) => {
    expect(faixaDoRestante(minutos * MINUTO)).toBe(esperado)
  })

  /**
   * Já começou não recebe lembrete. Avisar alguém de algo que começou é pior do
   * que não avisar: manda a pessoa correr para um compromisso que ela perdeu.
   */
  it.each([[0], [-1], [-60_000]])('restando %sms → nenhum lembrete', (ms) => {
    expect(faixaDoRestante(ms)).toBeNull()
  })

  /**
   * Contíguas e sem buraco: varrendo minuto a minuto das 25 horas até o início,
   * todo instante pertence a exatamente uma faixa. Um buraco aqui seria um
   * lembrete que nunca sai, e ninguém perceberia.
   */
  it('cobrem todo o intervalo, sem buraco e sem sobreposição', () => {
    const vistos = new Set<string>()
    for (let m = 1; m <= 25 * 60; m += 1) {
      const faixa = faixaDoRestante(m * MINUTO)
      expect(faixa).not.toBeNull()
      vistos.add(faixa!)
    }
    expect([...vistos].sort()).toEqual([...TIPOS_LEMBRETE].sort())
  })

  /**
   * A faixa mais estreita define a frequência do cron: se ela tiver 12 minutos,
   * um disparo a cada 10 sempre cai dentro. Este teste é o que impede alguém de
   * apertar a faixa sem apertar o cron junto.
   */
  it('a faixa mais estreita comporta o intervalo do cron', () => {
    const maisEstreita = TETO_DA_FAIXA['10min'] / MINUTO
    expect(maisEstreita).toBeGreaterThanOrEqual(INTERVALO_MAXIMO_DO_CRON_MINUTOS)
    expect(INTERVALO_MAXIMO_DO_CRON_MINUTOS).toBeGreaterThanOrEqual(10)
  })
})

describe('texto', () => {
  const base = { inicioEm: INICIO, fimEm: FIM, timezone: FUSO, outraParte: 'Dra. Ana' }

  it('o de 24h diz "amanhã" quando é amanhã no fuso da consultoria', () => {
    // 23 horas antes → dia anterior em São Paulo.
    const agora = new Date(INICIO.getTime() - 23 * 60 * MINUTO)
    const t = textoDoLembrete({ ...base, tipo: '24h', papel: 'cliente', agora })
    expect(t.resumo).toContain('amanhã às 14:00')
    expect(t.resumo).toContain('Dra. Ana')
  })

  it('o de 24h diz "hoje" quando ainda é o mesmo dia', () => {
    const agora = new Date(INICIO.getTime() - 3 * 60 * MINUTO)
    const t = textoDoLembrete({ ...base, tipo: '24h', papel: 'cliente', agora })
    expect(t.resumo).toContain('hoje às 14:00')
  })

  it('o texto muda conforme o lado', () => {
    const agora = new Date(INICIO.getTime() - 60 * MINUTO)
    const cliente = textoDoLembrete({ ...base, tipo: '1h', papel: 'cliente', agora })
    const pro = textoDoLembrete({
      ...base,
      outraParte: 'Paulo Ribeiro',
      tipo: '1h',
      papel: 'prestador',
      agora,
    })
    expect(cliente.resumo).toMatch(/^Sua consultoria com Dra\. Ana começa em 1 hora/)
    expect(pro.resumo).toMatch(/^Você tem uma consultoria com Paulo Ribeiro em 1 hora/)
  })

  /**
   * A faixa de 1 hora pega qualquer coisa até 75 minutos. Um texto fixo diria
   * "em 1 hora" para quem tem 20 minutos — o tempo é medido, não presumido.
   */
  it('não diz "1 hora" quando não falta 1 hora', () => {
    const agora = new Date(INICIO.getTime() - 20 * MINUTO)
    const t = textoDoLembrete({ ...base, tipo: '1h', papel: 'cliente', agora })
    expect(t.resumo).toContain('em 20 minutos')
    expect(t.resumo).not.toContain('1 hora')
  })

  /**
   * O caso que o enunciado destaca: a faixa de 10 minutos tem folga até 12, mas
   * a porta da videochamada abre exatamente aos 10. Nos dois minutos de
   * diferença o lembrete não pode prometer acesso que ainda não existe.
   */
  it('só afirma que a videochamada está liberada quando ela está', () => {
    const aindaFechada = new Date(INICIO.getTime() - 12 * MINUTO)
    const jaAberta = new Date(INICIO.getTime() - MINUTOS_ANTES_DA_CONSULTORIA * MINUTO)

    const antes = textoDoLembrete({ ...base, tipo: '10min', papel: 'cliente', agora: aindaFechada })
    const depois = textoDoLembrete({ ...base, tipo: '10min', papel: 'cliente', agora: jaAberta })

    expect(antes.resumo).toContain('abre 10 minutos antes')
    expect(antes.resumo).not.toContain('já está disponível')
    expect(depois.resumo).toContain('já está disponível')
  })

  it('nunca diz "0 minutos"', () => {
    const agora = new Date(INICIO.getTime() - 20_000)
    const t = textoDoLembrete({ ...base, tipo: '10min', papel: 'cliente', agora })
    expect(t.resumo).toContain('1 minuto')
    expect(t.resumo).not.toContain('0 minuto')
  })
})

describe('chave de dedupe', () => {
  it('separa tipo, agendamento e horário', () => {
    const chave = chaveDoLembrete('consultoria_lembrete', 'abc', '1h', INICIO)
    expect(chave).toBe(`consultoria_lembrete:abc:1h:${INICIO.toISOString()}`)
    // A coluna aceita 120 caracteres — a chave precisa caber sempre.
    expect(
      chaveDoLembrete(
        'consultoria_lembrete',
        '11111111-1111-4111-8111-111111111111',
        '10min',
        INICIO,
      ).length,
    ).toBeLessThanOrEqual(120)
  })

  /**
   * O horário dentro da chave é o que faz a remarcação voltar a gerar
   * lembretes: sem ele, o aviso de 24h do horário antigo bloquearia
   * silenciosamente o do horário novo.
   */
  it('muda quando o horário muda', () => {
    const outro = new Date(INICIO.getTime() + 24 * 60 * MINUTO)
    expect(chaveDoLembrete('t', 'abc', '24h', INICIO)).not.toBe(
      chaveDoLembrete('t', 'abc', '24h', outro),
    )
  })
})
