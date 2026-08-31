import { beforeAll, describe, expect, it } from 'vitest'
import { calculoDeterministico, violacoesComerciais } from '@/features/precificacao/lib/invariantes'
import { impactoDaAlteracao, QUEDA_QUE_PEDE_CONFIRMACAO } from '@/features/precificacao/lib/impacto'
import { calcularPreco, calcularPrecos } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'

/**
 * As garantias comerciais da tabela de preços.
 *
 * O que se cobra aqui não é a fórmula — disso cuidam as âncoras do motor — e
 * sim o contrato: nenhuma configuração que produza um preço impossível pode
 * atravessar em silêncio. Cada caso monta a configuração ruim de propósito e
 * exige que ela seja recusada com uma frase que o Gestor entenda.
 */

let tabela: TabelaPrecificacao

const comDesconto = (t: TabelaPrecificacao, codigo: string, milesimos: number) => ({
  ...t,
  descontos: t.descontos.map((d) =>
    d.codigo === codigo ? { ...d, descontoMilesimos: milesimos } : d,
  ),
})

const comPreco = (t: TabelaPrecificacao, regime: string, centavos: number) => ({
  ...t,
  precosBase: t.precosBase.map((p) =>
    p.regime === regime ? { ...p, valorCentavos: centavos } : p,
  ),
})

beforeAll(async () => {
  tabela = await obterTabelaPrecificacao()
})

describe('a configuração publicada hoje', () => {
  it('não viola nenhuma garantia comercial', () => {
    expect(violacoesComerciais(tabela)).toEqual([])
  })

  it('produz o mesmo preço toda vez que é calculada', () => {
    expect(calculoDeterministico(tabela, respostasIniciais(tabela))).toBe(true)
  })
})

describe('configurações que não podem ir ao ar', () => {
  it('preço-base zerado é recusado, com o regime apontado', () => {
    const violacoes = violacoesComerciais(comPreco(tabela, 'simples', 0))
    expect(violacoes.length).toBeGreaterThan(0)
    expect(violacoes[0].secao).toBe('precos_base')
    expect(violacoes.some((v) => v.mensagem.includes('Simples Nacional'))).toBe(true)
  })

  it('desconto que zera a mensalidade é recusado', () => {
    // 99,9% é aceito pelo Zod campo a campo; o que reprova é o preço final.
    const violacoes = violacoesComerciais(comDesconto(tabela, 'doze_meses', 999))
    expect(violacoes.some((v) => v.secao === 'descontos')).toBe(true)
  })

  it('prazo maior não pode render menos desconto que o menor', () => {
    // 6 meses com 15% e 12 meses com 8%: os dois são vendidos como economia
    // por prazo, então o de doze sairia mais caro que o de seis.
    const invertida = comDesconto(comDesconto(tabela, 'seis_meses', 150), 'doze_meses', 80)
    const violacoes = violacoesComerciais(invertida)
    expect(violacoes.some((v) => v.campo === 'doze_meses')).toBe(true)
    expect(violacoes[0].mensagem).toMatch(/mais caro|menor que/)
  })

  it('pacote sem economia real é recusado', () => {
    // Decisão comercial: o Pacote existe para custar menos. Empatar com a soma
    // é anunciar "Economize R$ 0/mês", e isso não vai ao ar.
    const semDesconto = comDesconto(tabela, 'combo', 0)
    const combo = calcularPrecos(semDesconto, respostasIniciais(semDesconto)).find(
      (p) => p.combo,
    )!
    expect(combo.mensalCentavos).toBe(combo.combo!.separadoCentavos)
    expect(combo.combo!.economiaMensalCentavos).toBe(0)

    const violacoes = violacoesComerciais(semDesconto)
    expect(violacoes.some((v) => v.campo === 'combo')).toBe(true)
    expect(violacoes.find((v) => v.campo === 'combo')?.mensagem).toMatch(
      /economia real em relação à contratação separada/,
    )
  })

  it('desconto pequeno continua válido quando produz economia em todo perfil', () => {
    // A regra recusa empate, não desconto modesto: 5% gera economia real
    // inclusive no perfil mais barato.
    const modesto = comDesconto(tabela, 'combo', 50)
    const combo = calcularPrecos(modesto, respostasIniciais(modesto)).find((p) => p.combo)!
    expect(combo.combo!.economiaMensalCentavos).toBeGreaterThan(0)
    expect(violacoesComerciais(modesto).filter((v) => v.campo === 'combo')).toEqual([])
  })

  it('um desconto que o arredondamento engole no perfil mais barato é recusado', () => {
    /*
      Com 1%, o MEI mínimo tem soma de R$ 190: o desconto dá R$ 1,90 e o
      arredondamento para múltiplo de R$ 5 devolve o valor cheio. O pacote
      empataria com a soma justamente para o cliente menor, e a vitrine
      anunciaria economia zero. A garantia olha os extremos, não só o perfil de
      referência — é por isso que ela pega este caso.
    */
    const quaseNada = comDesconto(tabela, 'combo', 10)
    const noReferencia = calcularPrecos(quaseNada, respostasIniciais(quaseNada)).find(
      (p) => p.combo,
    )!
    expect(noReferencia.combo!.economiaMensalCentavos).toBeGreaterThan(0)

    const violacoes = violacoesComerciais(quaseNada).filter((v) => v.campo === 'combo')
    expect(violacoes.length).toBeGreaterThan(0)
    expect(violacoes[0].mensagem).toMatch(/economia real/)
  })

  it('o desconto do pacote em vigor continua produzindo economia real', () => {
    const combo = calcularPrecos(tabela, respostasIniciais(tabela)).find((p) => p.combo)!
    expect(combo.combo!.economiaMensalCentavos).toBeGreaterThan(0)
    expect(combo.mensalCentavos).toBeLessThan(combo.combo!.separadoCentavos)
  })

  it('multiplicador zero é recusado antes de zerar o preço', () => {
    const zerado: TabelaPrecificacao = {
      ...tabela,
      dimensoes: tabela.dimensoes.map((d) =>
        d.codigo === 'atendimento'
          ? {
              ...d,
              opcoes: d.opcoes.map((o) =>
                o.codigo === 'hibrido' ? { ...o, multiplicadorMilesimos: 0 } : o,
              ),
            }
          : d,
      ),
    }
    const violacoes = violacoesComerciais(zerado)
    expect(violacoes.some((v) => v.secao === 'atendimento')).toBe(true)
  })

  it('arredondamento zero é recusado', () => {
    const violacoes = violacoesComerciais({
      ...tabela,
      parametros: { ...tabela.parametros, arredondamentoCentavos: 0 },
    })
    expect(violacoes.some((v) => v.secao === 'geral')).toBe(true)
  })

  it('toda mensagem é escrita para quem administra preço', () => {
    const violacoes = violacoesComerciais(comPreco(tabela, 'simples', 0))
    for (const violacao of violacoes) {
      expect(violacao.mensagem).not.toMatch(
        /constraint|bigint|undefined|null|SQL|Drizzle|stack|Zod/i,
      )
      expect(violacao.mensagem.length).toBeGreaterThan(20)
    }
  })
})

describe('impacto comercial de uma alteração', () => {
  it('o limite aprovado é 25% de queda', () => {
    expect(QUEDA_QUE_PEDE_CONFIRMACAO).toBe(25)
  })

  it('reajuste pequeno não pede confirmação', () => {
    // 195 → 185: menos de 6% no perfil de referência.
    const impacto = impactoDaAlteracao(tabela, comPreco(tabela, 'simples', 18_500))
    expect(impacto.exigeConfirmacao).toBe(false)
  })

  it('um dígito a menos no preço pede confirmação, com o antes e o depois', () => {
    const impacto = impactoDaAlteracao(tabela, comPreco(tabela, 'simples', 1950))
    expect(impacto.exigeConfirmacao).toBe(true)
    expect(impacto.maiorQuedaPercentual).toBeGreaterThanOrEqual(
      QUEDA_QUE_PEDE_CONFIRMACAO,
    )
    const queda = impacto.quedas[0]
    expect(queda.de).toBeGreaterThan(queda.para)
    expect(queda.nome).toBeTruthy()
  })

  it('aumentar preço nunca pede confirmação de queda', () => {
    expect(
      impactoDaAlteracao(tabela, comPreco(tabela, 'simples', 30_000)).exigeConfirmacao,
    ).toBe(false)
  })
})

describe('propriedades do preço', () => {
  const base = (): RespostasPrecificacao => respostasIniciais(tabela)
  const preco = (r: RespostasPrecificacao, servico = 'padrao') =>
    calcularPreco(tabela, servico, r).mensalCentavos

  it('mais funcionários nunca reduz o preço', () => {
    let anterior = -1
    for (const funcionarios of [0, 1, 2, 3, 5, 10, 25, 50, 200]) {
      const atual = preco({ ...base(), funcionarios })
      expect(atual, `com ${funcionarios} funcionários`).toBeGreaterThanOrEqual(anterior)
      anterior = atual
    }
  })

  it('faixa de faturamento maior nunca reduz o preço', () => {
    const faixas = tabela.faixas
      .filter((f) => f.grupo === 'contabil' && f.tipo === 'faturamento')
      .sort((a, b) => a.limiteMin - b.limiteMin)
    let anterior = -1
    for (const faixa of faixas) {
      const atual = preco({ ...base(), faturamento: faixa.codigo })
      expect(atual, faixa.codigo).toBeGreaterThanOrEqual(anterior)
      anterior = atual
    }
  })

  it('faixa de notas maior nunca reduz o preço', () => {
    const faixas = tabela.faixas
      .filter((f) => f.grupo === 'contabil' && f.tipo === 'notas_fiscais')
      .sort((a, b) => a.limiteMin - b.limiteMin)
    let anterior = -1
    for (const faixa of faixas) {
      const atual = preco({ ...base(), emissor: 'vincis', notasFiscais: faixa.codigo })
      expect(atual, faixa.codigo).toBeGreaterThanOrEqual(anterior)
      anterior = atual
    }
  })

  it('acrescentar um adicional nunca reduz o preço', () => {
    const semNenhum = preco({ ...base(), adicionais: [] })
    let anterior = semNenhum
    const codigos = tabela.adicionais.map((a) => a.codigo)
    for (let i = 1; i <= codigos.length; i += 1) {
      const atual = preco({ ...base(), adicionais: codigos.slice(0, i) })
      expect(atual, `${i} adicionais`).toBeGreaterThanOrEqual(anterior)
      anterior = atual
    }
    expect(anterior).toBeGreaterThan(semNenhum)
  })

  it('prazo maior nunca sai mais caro que prazo menor', () => {
    for (const servico of ['padrao', 'consultiva', 'juridico', 'combo']) {
      const periodos = calcularPreco(tabela, servico, base()).periodos
      for (let i = 1; i < periodos.length; i += 1) {
        expect(
          periodos[i].mensalCentavos,
          `${servico} ${periodos[i].periodo}`,
        ).toBeLessThanOrEqual(periodos[i - 1].mensalCentavos)
      }
    }
  })

  it('o pacote sempre sai mais barato que contratar separadamente', () => {
    for (const funcionarios of [0, 3, 40]) {
      const combo = calcularPreco(tabela, 'combo', { ...base(), funcionarios })
      // Menor, não "menor ou igual": empate deixou de ser aceitável.
      expect(combo.mensalCentavos).toBeLessThan(combo.combo!.separadoCentavos)
      expect(combo.combo!.economiaMensalCentavos).toBeGreaterThan(0)
      expect(combo.combo!.economiaMensalCentavos).toBe(
        combo.combo!.separadoCentavos - combo.mensalCentavos,
      )
    }
  })

  it('a mesma entrada devolve exatamente a mesma saída', () => {
    const respostas = { ...base(), funcionarios: 17, atividades: ['industria'] }
    expect(JSON.stringify(calcularPrecos(tabela, respostas))).toBe(
      JSON.stringify(calcularPrecos(tabela, respostas)),
    )
  })
})

describe('cenários extremos', () => {
  const regimes = () => ['mei', 'simples', 'presumido', 'real']
  const servicos = () => ['padrao', 'consultiva', 'juridico', 'combo']

  it('nenhuma combinação produz NaN, Infinity ou valor não positivo', () => {
    const notas = tabela.faixas
      .filter((f) => f.tipo === 'notas_fiscais')
      .map((f) => f.codigo)
    const faturamentos = tabela.faixas
      .filter((f) => f.tipo === 'faturamento')
      .map((f) => f.codigo)
    const todosAdicionais = tabela.adicionais.map((a) => a.codigo)
    let combinacoes = 0

    for (const regime of regimes()) {
      for (const funcionarios of [0, 1, 2, 3, 200]) {
        for (const nota of [notas[0], notas.at(-1)!]) {
          for (const faturamento of [faturamentos[0], faturamentos.at(-1)!]) {
            for (const emissor of ['empresa', 'vincis']) {
              for (const atividade of ['servicos', 'industria']) {
                for (const atendimento of ['digital', 'prioritario']) {
                  for (const rotina of ['compartilhado', 'vincis']) {
                    for (const adicionais of [[], todosAdicionais]) {
                      const respostas: RespostasPrecificacao = {
                        regime,
                        atividades: [atividade],
                        funcionarios,
                        notasFiscais: nota,
                        emissor,
                        faturamento,
                        atendimento,
                        rotina,
                        adicionais,
                      }
                      for (const servico of servicos()) {
                        const preco = calcularPreco(tabela, servico, respostas)
                        combinacoes += 1
                        expect(Number.isFinite(preco.mensalCentavos)).toBe(true)
                        expect(Number.isInteger(preco.mensalCentavos)).toBe(true)
                        expect(preco.mensalCentavos).toBeGreaterThan(0)
                        for (const periodo of preco.periodos) {
                          expect(Number.isInteger(periodo.mensalCentavos)).toBe(true)
                          expect(periodo.mensalCentavos).toBeGreaterThan(0)
                          expect(periodo.totalPeriodoCentavos).toBeGreaterThan(0)
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(combinacoes).toBe(4 * 5 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 4)
  })

  it('múltiplas atividades continuam usando a primeira marcada', () => {
    const uma = calcularPreco(tabela, 'padrao', {
      ...respostasIniciais(tabela),
      atividades: ['industria'],
    }).mensalCentavos
    const varias = calcularPreco(tabela, 'padrao', {
      ...respostasIniciais(tabela),
      atividades: ['industria', 'servicos', 'comercio'],
    }).mensalCentavos
    expect(varias).toBe(uma)
  })
})

describe('a leitura da tabela é determinística', () => {
  it('a mesma consulta devolve a mesma ordem, sempre', async () => {
    // `ordem` empata entre famílias — a primeira faixa de notas e a primeira de
    // faturamento são as duas "1". Com empate, o Postgres decide pelo plano de
    // execução e a resposta muda entre chamadas. Nada no produto depende dessa
    // ordem hoje, mas uma leitura que varia é armadilha para o próximo
    // consumidor que confiar nela.
    const leituras = await Promise.all(
      Array.from({ length: 5 }, () => obterTabelaPrecificacao()),
    )
    for (const leitura of leituras.slice(1)) {
      expect(leitura).toEqual(leituras[0])
    }

    // E a ordem é a que a leitura promete: agrupada por família e crescente
    // dentro dela.
    const familias = leituras[0].faixas.map((f) => `${f.grupo}/${f.tipo}`)
    expect(familias).toEqual([...familias].sort())
  })
})
