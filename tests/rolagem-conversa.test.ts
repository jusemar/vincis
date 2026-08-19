import { describe, expect, it } from 'vitest'
import {
  decidirRolagem,
  estaNoFim,
  TOLERANCIA_FIM_PX,
} from '@/features/atendimentos/lib/rolagem-conversa'

/**
 * As regras do chat, sem DOM.
 *
 * O hook cuida de medir e rolar; o que decide "acompanhar, avisar ou ficar
 * quieto" é este par de funções — e é aqui que a regressão apareceria se
 * alguém trocasse a tolerância por uma igualdade ou invertesse uma condição.
 */
describe('está no fim da conversa', () => {
  const base = { scrollHeight: 2000, clientHeight: 500 }

  it('encostado no fim conta como fim', () => {
    expect(estaNoFim({ ...base, scrollTop: 1500 })).toBe(true)
  })

  it('meio pixel de diferença ainda é o fim', () => {
    // O caso que uma comparação por igualdade erraria.
    expect(estaNoFim({ ...base, scrollTop: 1499.5 })).toBe(true)
  })

  it('dentro da tolerância conta como fim', () => {
    expect(estaNoFim({ ...base, scrollTop: 1500 - TOLERANCIA_FIM_PX + 1 })).toBe(
      true,
    )
  })

  it('além da tolerância é leitura de histórico', () => {
    expect(estaNoFim({ ...base, scrollTop: 1500 - TOLERANCIA_FIM_PX - 1 })).toBe(
      false,
    )
    expect(estaNoFim({ ...base, scrollTop: 0 })).toBe(false)
  })

  it('conversa que não rola está sempre no fim', () => {
    expect(
      estaNoFim({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }),
    ).toBe(true)
  })
})

describe('decisão ao mudar a lista', () => {
  const padrao = {
    chegouMensagem: true,
    ancorado: true,
    ultimaEhMinha: false,
    focoEmNaoLida: false,
  }

  it('estando no fim, acompanha a mensagem recebida', () => {
    expect(decidirRolagem(padrao)).toBe('ir-para-o-fim')
  })

  it('lendo o histórico, avisa em vez de puxar', () => {
    expect(decidirRolagem({ ...padrao, ancorado: false })).toBe(
      'avisar-nova-mensagem',
    )
  })

  it('mensagem própria sempre desce, mesmo lendo o histórico', () => {
    expect(
      decidirRolagem({ ...padrao, ancorado: false, ultimaEhMinha: true }),
    ).toBe('ir-para-o-fim')
  })

  it('o foco na primeira não lida ganha de tudo', () => {
    expect(decidirRolagem({ ...padrao, focoEmNaoLida: true })).toBe(
      'manter-posicao',
    )
    // Inclusive de uma mensagem própria: quem clicou no badge pediu outra coisa.
    expect(
      decidirRolagem({ ...padrao, focoEmNaoLida: true, ultimaEhMinha: true }),
    ).toBe('manter-posicao')
  })

  it('re-render sem mensagem nova não mexe na posição', () => {
    expect(decidirRolagem({ ...padrao, chegouMensagem: false })).toBe(
      'manter-posicao',
    )
    expect(
      decidirRolagem({ ...padrao, chegouMensagem: false, ancorado: false }),
    ).toBe('manter-posicao')
  })
})
