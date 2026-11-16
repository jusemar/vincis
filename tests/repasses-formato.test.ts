import { describe, expect, it } from 'vitest'
import { formatarValorRepasse } from '@/features/repasses/lib/formato'
import { dividirAlocacoes, liquidoDaVincis } from '@/features/repasses/lib/regras'
import { calcularComissaoVincis, formatarPercentualMilesimos } from '@/features/servicos/constants/comissao'
import { formatarCentavos } from '@/features/precificacao/lib/formato'

/** Intl usa espaço não separável depois de "R$" (`\s` o inclui); o teste compara o texto visível. */
const texto = (valor: string) => valor.replace(/\s/g, ' ')

describe('formato dos valores de repasse', () => {
  it('sempre com duas casas, sem arredondar para reais inteiros', () => {
    expect(texto(formatarValorRepasse(100))).toBe('R$ 1,00')
    expect(texto(formatarValorRepasse(75))).toBe('R$ 0,75')
    expect(texto(formatarValorRepasse(25))).toBe('R$ 0,25')
    expect(texto(formatarValorRepasse(0))).toBe('R$ 0,00')
    expect(texto(formatarValorRepasse(1))).toBe('R$ 0,01')
    expect(texto(formatarValorRepasse(123456))).toBe('R$ 1.234,56')
    expect(texto(formatarValorRepasse(-10))).toBe('-R$ 0,10')
  })

  it('o Pix real de R$ 1,00 a 25%: recebido 1,00 · profissional 0,75 · Vincis 0,25 · indicador 0,00', () => {
    const divisao = calcularComissaoVincis(100, 250)
    expect(divisao.comissaoCentavos).toBe(25)
    expect(divisao.profissionalCentavos).toBe(75)
    expect(divisao.comissaoCentavos + divisao.profissionalCentavos).toBe(100)

    const linha = dividirAlocacoes([{ valorCentavos: 100, milesimos: 250 }])
    expect(linha).toEqual({ tipo: 'ok', divisao: { milesimos: 250, comissaoCentavos: 25, profissionalCentavos: 75 } })

    expect(texto(formatarValorRepasse(100))).toBe('R$ 1,00')
    expect(texto(formatarValorRepasse(divisao.profissionalCentavos))).toBe('R$ 0,75')
    expect(texto(formatarValorRepasse(divisao.comissaoCentavos))).toBe('R$ 0,25')
    expect(texto(formatarValorRepasse(0))).toBe('R$ 0,00')
    expect(texto(formatarValorRepasse(liquidoDaVincis(25, 0)!))).toBe('R$ 0,25')
    expect(formatarPercentualMilesimos(250)).toBe('25%')
  })

  it('o formato da Precificação (vitrine) continua sem centavos', () => {
    expect(texto(formatarCentavos(12345))).toBe('R$ 123')
  })
})
