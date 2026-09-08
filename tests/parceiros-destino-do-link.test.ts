import { describe, expect, it } from 'vitest'
import {
  DESTINO_PADRAO,
  montarLinkDeIndicacao,
  resolverDestinoInterno,
} from '@/features/parceiros/constants/destino'

const PERFIL = '/perfil-profissional?prestador=706b616e-6d38-4aa0-a40d-8c8cdedafb1a'

/**
 * O destino chega pela URL, onde qualquer pessoa escreve o que quiser. A regra
 * é lista fechada: o que não está nela vira a home, sem erro e sem mandar
 * ninguém para fora da Vincis.
 */
describe('destino do link de indicação', () => {
  it('mantém o perfil do profissional e preserva o prestador', () => {
    expect(resolverDestinoInterno(PERFIL)).toBe(PERFIL)
  })

  it('a home é o destino de sempre', () => {
    expect(resolverDestinoInterno(null)).toBe(DESTINO_PADRAO)
    expect(resolverDestinoInterno('/')).toBe(DESTINO_PADRAO)
  })

  it('endereço externo não vira destino', () => {
    for (const externo of [
      'https://evil.com',
      'http://evil.com/x',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      'evil.com',
    ]) {
      expect(resolverDestinoInterno(externo)).toBe(DESTINO_PADRAO)
    }
  })

  it('página interna fora da lista não vira destino', () => {
    expect(resolverDestinoInterno('/admin')).toBe(DESTINO_PADRAO)
    expect(resolverDestinoInterno('/cliente/parceiros')).toBe(DESTINO_PADRAO)
  })

  it('parâmetro não declarado é descartado', () => {
    const sujo =
      '/perfil-profissional?prestador=abc&next=https://evil.com&token=segredo'
    const limpo = resolverDestinoInterno(sujo)
    expect(limpo).toBe('/perfil-profissional?prestador=abc')
    expect(limpo).not.toContain('evil.com')
    expect(limpo).not.toContain('token')
  })

  it('o link do parceiro é o mesmo código, com destino a mais', () => {
    const geral = montarLinkDeIndicacao('https://vincis.test', 'y7n6z5ab', null)
    const doPerfil = montarLinkDeIndicacao(
      'https://vincis.test',
      'y7n6z5ab',
      PERFIL,
    )

    expect(geral).toBe('https://vincis.test/p/y7n6z5ab')
    expect(doPerfil.startsWith('https://vincis.test/p/y7n6z5ab?')).toBe(true)
    // Um código só: o destino muda a chegada, nunca a captação.
    expect(doPerfil).toContain('y7n6z5ab')
    expect(decodeURIComponent(doPerfil)).toContain(PERFIL)
  })

  it('destino externo no montador também cai na home', () => {
    expect(
      montarLinkDeIndicacao('https://vincis.test', 'y7n6z5ab', '//evil.com'),
    ).toBe('https://vincis.test/p/y7n6z5ab')
  })
})
