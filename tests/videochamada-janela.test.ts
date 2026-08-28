import { describe, expect, it } from 'vitest'
import {
  MINUTOS_ANTES_DA_CONSULTORIA,
  MINUTOS_DE_TOLERANCIA,
} from '@/features/videochamada/constants/videochamada'
import {
  janelaAberta,
  janelaDaVideochamada,
  segundosAteAbrir,
  situacaoDaJanela,
} from '@/features/videochamada/lib/janela'
import { gerarNomeDeSala, NOME_DE_SALA_VALIDO } from '@/features/videochamada/lib/nome-da-sala'

/**
 * A janela de acesso, no relógio.
 *
 * Nada aqui toca banco nem rede: a regra é aritmética entre instantes, e é
 * exatamente por isso que ela pode ser cobrada segundo a segundo. O relógio é
 * um parâmetro — não `Date.now()` disfarçado —, então o teste não depende do
 * momento em que roda nem do fuso da máquina.
 */

/** `14:30 → 15:30` no fuso de São Paulo (UTC-3), escrito como instante. */
const INICIO = new Date('2026-09-10T17:30:00.000Z')
const FIM = new Date('2026-09-10T18:30:00.000Z')
const CONSULTORIA = { inicioEm: INICIO, fimEm: FIM }

/** Facilita ler os casos: "o instante X, deslocado N segundos". */
function em(base: Date, segundos: number) {
  return new Date(base.getTime() + segundos * 1000)
}

describe('janela de acesso', () => {
  it('abre 10 minutos antes e fecha 15 depois do fim', () => {
    const janela = janelaDaVideochamada(CONSULTORIA)
    expect(janela.abreEm.toISOString()).toBe('2026-09-10T17:20:00.000Z')
    expect(janela.fechaEm.toISOString()).toBe('2026-09-10T18:45:00.000Z')
    // As constantes são a fonte — se alguém mudar 10 ou 15, isto acompanha.
    expect(
      (INICIO.getTime() - janela.abreEm.getTime()) / 60_000,
    ).toBe(MINUTOS_ANTES_DA_CONSULTORIA)
    expect((janela.fechaEm.getTime() - FIM.getTime()) / 60_000).toBe(
      MINUTOS_DE_TOLERANCIA,
    )
  })

  /**
   * A fronteira, segundo a segundo.
   *
   * O intervalo é `[abre, fecha)`: o primeiro instante de 14:20 já vale, e o
   * primeiro instante de 15:45 já não vale. Um intervalo fechado nas duas
   * pontas faria a tolerância durar "15 minutos e um instante" — e é o tipo de
   * frouxidão que ninguém percebe até virar discussão sobre quem tinha razão.
   */
  it.each([
    ['14:19:59 — um segundo antes de abrir', -601, 'antes'],
    ['14:20:00 — o instante em que abre', -600, 'aberta'],
    ['14:20:01', -599, 'aberta'],
    ['14:29:59', -1, 'aberta'],
    ['14:30:00 — o horário marcado', 0, 'aberta'],
  ])('%s', (_rotulo, deslocamento, esperado) => {
    expect(situacaoDaJanela(janelaDaVideochamada(CONSULTORIA), em(INICIO, deslocamento)))
      .toBe(esperado)
  })

  it.each([
    ['15:29:59 — durante a consulta', -1, 'aberta'],
    ['15:30:00 — o fim contratado', 0, 'aberta'],
    ['15:44:59 — último segundo da tolerância', 899, 'aberta'],
    ['15:45:00 — a janela fecha', 900, 'encerrada'],
    ['15:45:01', 901, 'encerrada'],
    ['no dia seguinte', 86_400, 'encerrada'],
  ])('%s', (_rotulo, deslocamento, esperado) => {
    expect(situacaoDaJanela(janelaDaVideochamada(CONSULTORIA), em(FIM, deslocamento)))
      .toBe(esperado)
  })

  it('o atalho booleano concorda com a situação', () => {
    expect(janelaAberta(CONSULTORIA, em(INICIO, -601))).toBe(false)
    expect(janelaAberta(CONSULTORIA, em(INICIO, -600))).toBe(true)
    expect(janelaAberta(CONSULTORIA, em(FIM, 899))).toBe(true)
    expect(janelaAberta(CONSULTORIA, em(FIM, 900))).toBe(false)
  })

  /**
   * O fuso da Vercel não pode mudar a decisão.
   *
   * A conta é entre instantes absolutos, então o mesmo `Date` avaliado com o
   * processo em UTC ou em São Paulo dá o mesmo resultado. Este teste existe
   * porque a forma errada — comparar "14:30" com a hora local do servidor —
   * passaria despercebida em uma máquina brasileira e quebraria na nuvem.
   */
  it('não depende do fuso do processo', () => {
    const original = process.env.TZ
    const situacoes = new Set<string>()
    for (const fuso of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
      process.env.TZ = fuso
      situacoes.add(
        situacaoDaJanela(janelaDaVideochamada(CONSULTORIA), em(INICIO, -600)),
      )
    }
    process.env.TZ = original
    expect([...situacoes]).toEqual(['aberta'])
  })

  it('conta quanto falta para abrir, e para em zero', () => {
    const janela = janelaDaVideochamada(CONSULTORIA)
    expect(segundosAteAbrir(janela, em(INICIO, -900))).toBe(300)
    expect(segundosAteAbrir(janela, em(INICIO, -600))).toBe(0)
    expect(segundosAteAbrir(janela, em(INICIO, 0))).toBe(0)
  })
})

describe('nome da sala', () => {
  it('respeita o alfabeto e o limite da Daily', () => {
    for (let i = 0; i < 50; i += 1) {
      const nome = gerarNomeDeSala()
      expect(nome).toMatch(NOME_DE_SALA_VALIDO)
      expect(nome.length).toBeLessThanOrEqual(128)
    }
  })

  /**
   * Não previsível.
   *
   * Cinco mil sorteios sem repetição não *provam* imprevisibilidade — a prova
   * está nos 192 bits de `randomBytes`. O que este teste pega é a regressão
   * real e banal: alguém trocar o sorteio por um contador, pelo protocolo ou
   * por um hash do id da consultoria, e ninguém notar porque tudo continua
   * funcionando.
   */
  it('não se repete e não carrega nada de ninguém', () => {
    const nomes = new Set(Array.from({ length: 5_000 }, () => gerarNomeDeSala()))
    expect(nomes.size).toBe(5_000)
    expect([...nomes].some((n) => /2026|protocolo|\d{4}-\d{4}/.test(n))).toBe(false)
  })
})
