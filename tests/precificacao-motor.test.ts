import { describe, expect, it } from 'vitest'
import { ErroPrecificacao } from '@/features/precificacao/lib/erros'
import { rotuloDaLinha } from '@/features/precificacao/lib/descricao'
import {
  arredondarParaMultiplo,
  exato,
} from '@/features/precificacao/lib/aritmetica'
import { calcularPreco, calcularPrecos } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'

/**
 * As âncoras do motor de precificação.
 *
 * Os valores abaixo não são gerados pelo motor no momento do teste: estão
 * escritos, em centavos, e vieram da matriz de equivalência que provou que o
 * motor novo repetia a página antiga. É o que os torna úteis — um teste que
 * recalculasse o esperado concordaria com qualquer regra, inclusive a errada.
 *
 * Quando um número daqui mudar, a pergunta é sempre a mesma: foi reajuste
 * intencional na tabela do banco, ou a fórmula se moveu sem ninguém pedir?
 */

/** Perfil mínimo: isola o preço-base, sem funcionários, notas nem fatores. */
const MINIMO: RespostasPrecificacao = {
  regime: 'simples',
  atividades: ['servicos'],
  funcionarios: 0,
  notasFiscais: 'ate10',
  emissor: 'empresa',
  faturamento: 'ate50k',
  atendimento: 'digital',
  rotina: 'compartilhado',
  adicionais: [],
}

/** O perfil com que a página abre. */
const PERFIL_PADRAO: RespostasPrecificacao = {
  regime: 'simples',
  atividades: ['servicos'],
  funcionarios: 3,
  notasFiscais: '11a30',
  emissor: 'vincis',
  faturamento: 'ate50k',
  atendimento: 'hibrido',
  rotina: 'compartilhado',
  adicionais: [],
}

type Ancora = [
  nome: string,
  respostas: Partial<RespostasPrecificacao>,
  servico: string,
  mensalCentavos: number,
]

const ANCORAS_BASE: Ancora[] = [
  ['MEI padrão', { regime: 'mei' }, 'padrao', 9000],
  ['MEI consultiva', { regime: 'mei' }, 'consultiva', 12000],
  ['MEI jurídico', { regime: 'mei' }, 'juridico', 7000],
  ['MEI completo', { regime: 'mei' }, 'combo', 16000],
  ['Simples padrão', { regime: 'simples' }, 'padrao', 19500],
  ['Simples consultiva', { regime: 'simples' }, 'consultiva', 26500],
  ['Simples jurídico', { regime: 'simples' }, 'juridico', 15000],
  ['Simples completo', { regime: 'simples' }, 'combo', 35500],
  ['Presumido padrão', { regime: 'presumido' }, 'padrao', 39000],
  ['Presumido consultiva', { regime: 'presumido' }, 'consultiva', 52500],
  ['Presumido jurídico', { regime: 'presumido' }, 'juridico', 23000],
  ['Presumido completo', { regime: 'presumido' }, 'combo', 64000],
  ['Real padrão', { regime: 'real' }, 'padrao', 75000],
  ['Real consultiva', { regime: 'real' }, 'consultiva', 101000],
  ['Real jurídico', { regime: 'real' }, 'juridico', 38000],
  ['Real completo', { regime: 'real' }, 'combo', 118000],
]

const ANCORAS_FUNCIONARIOS: Ancora[] = [
  ['0 funcionários contábil', { funcionarios: 0 }, 'padrao', 19500],
  ['1 funcionário contábil', { funcionarios: 1 }, 'padrao', 19500],
  ['2 funcionários contábil', { funcionarios: 2 }, 'padrao', 19500],
  ['3 funcionários contábil', { funcionarios: 3 }, 'padrao', 22000],
  ['4 funcionários contábil', { funcionarios: 4 }, 'padrao', 24500],
  ['10 funcionários contábil', { funcionarios: 10 }, 'padrao', 38500],
  ['27 funcionários contábil', { funcionarios: 27 }, 'padrao', 79500],
  ['0 funcionários jurídico', { funcionarios: 0 }, 'juridico', 15000],
  ['1 funcionário jurídico', { funcionarios: 1 }, 'juridico', 15000],
  ['2 funcionários jurídico', { funcionarios: 2 }, 'juridico', 15000],
  ['3 funcionários jurídico', { funcionarios: 3 }, 'juridico', 16000],
  ['4 funcionários jurídico', { funcionarios: 4 }, 'juridico', 17000],
  ['10 funcionários jurídico', { funcionarios: 10 }, 'juridico', 22000],
  ['27 funcionários jurídico', { funcionarios: 27 }, 'juridico', 37500],
]

const ANCORAS_NOTAS: Ancora[] = [
  ['até 10, cliente emite', { notasFiscais: 'ate10', emissor: 'empresa' }, 'padrao', 19500],
  ['até 10, Vincis emite', { notasFiscais: 'ate10', emissor: 'vincis' }, 'padrao', 19500],
  ['11 a 30, cliente emite', { notasFiscais: '11a30', emissor: 'empresa' }, 'padrao', 19500],
  ['11 a 30, Vincis emite', { notasFiscais: '11a30', emissor: 'vincis' }, 'padrao', 22000],
  ['31 a 100, cliente emite', { notasFiscais: '31a100', emissor: 'empresa' }, 'padrao', 19500],
  ['31 a 100, Vincis emite', { notasFiscais: '31a100', emissor: 'vincis' }, 'padrao', 26500],
  ['101 a 250, cliente emite', { notasFiscais: '101a250', emissor: 'empresa' }, 'padrao', 19500],
  ['101 a 250, Vincis emite', { notasFiscais: '101a250', emissor: 'vincis' }, 'padrao', 35500],
  ['mais de 250, cliente emite', { notasFiscais: 'mais250', emissor: 'empresa' }, 'padrao', 19500],
  ['mais de 250, Vincis emite', { notasFiscais: 'mais250', emissor: 'vincis' }, 'padrao', 51500],
]

const ANCORAS_FATURAMENTO: Ancora[] = [
  ['faturamento até 50k', { faturamento: 'ate50k' }, 'padrao', 19500],
  ['faturamento 50k a 150k', { faturamento: '50a150k' }, 'padrao', 25500],
  ['faturamento 150k a 500k', { faturamento: '150a500k' }, 'padrao', 37500],
  ['faturamento 500k a 1M', { faturamento: '500ka1m' }, 'padrao', 53500],
  ['faturamento acima de 1M', { faturamento: 'acima1m' }, 'padrao', 81500],
]

const ANCORAS_DIMENSOES: Ancora[] = [
  ['ramo serviços', { atividades: ['servicos'] }, 'padrao', 19500],
  ['ramo comércio', { atividades: ['comercio'] }, 'padrao', 21000],
  ['ramo indústria', { atividades: ['industria'] }, 'padrao', 23000],
  // Só a primeira atividade marcada multiplica — comportamento preservado.
  ['comércio antes de indústria', { atividades: ['comercio', 'industria'] }, 'padrao', 21000],
  ['indústria antes de comércio', { atividades: ['industria', 'comercio'] }, 'padrao', 23000],
  ['atendimento digital', { atendimento: 'digital' }, 'padrao', 19500],
  ['atendimento híbrido', { atendimento: 'hibrido' }, 'padrao', 21000],
  ['atendimento prioritário', { atendimento: 'prioritario' }, 'padrao', 23500],
  ['rotina compartilhada', { rotina: 'compartilhado' }, 'padrao', 19500],
  ['rotina com a Vincis', { rotina: 'vincis' }, 'padrao', 22000],
  // O Jurídico não paga por ramo nem por rotina: as duas dimensões não valem
  // para o grupo dele, e o preço não se move.
  ['ramo não afeta o jurídico', { atividades: ['industria'] }, 'juridico', 15000],
  ['rotina não afeta o jurídico', { rotina: 'vincis' }, 'juridico', 15000],
  ['nota não afeta o jurídico', { notasFiscais: 'mais250', emissor: 'vincis' }, 'juridico', 15000],
  ['faturamento não afeta o jurídico', { faturamento: 'acima1m' }, 'juridico', 15000],
  ['atendimento afeta o jurídico', { atendimento: 'prioritario' }, 'juridico', 18000],
]

const ANCORAS_ADICIONAIS: Ancora[] = [
  ['emissão extra', { adicionais: ['emissao_extra'] }, 'padrao', 23500],
  ['reunião mensal', { adicionais: ['reuniao_mensal'] }, 'padrao', 25500],
  ['suporte prioritário', { adicionais: ['suporte_prioritario'] }, 'padrao', 24500],
  ['especialista dedicado', { adicionais: ['especialista_dedicado'] }, 'padrao', 34500],
  [
    'todos os adicionais',
    {
      adicionais: [
        'emissao_extra',
        'reuniao_mensal',
        'suporte_prioritario',
        'especialista_dedicado',
      ],
    },
    'padrao',
    49000,
  ],
]

describe('motor de precificação', () => {
  let tabela: TabelaPrecificacao

  it('lê a configuração real do banco', async () => {
    tabela = await obterTabelaPrecificacao()
    expect(tabela.servicos.map((s) => s.codigo)).toEqual([
      'padrao',
      'consultiva',
      'juridico',
      'combo',
    ])
  })

  describe.each([
    ['preço-base por regime', ANCORAS_BASE],
    ['funcionários', ANCORAS_FUNCIONARIOS],
    ['notas fiscais e emissor', ANCORAS_NOTAS],
    ['faturamento', ANCORAS_FATURAMENTO],
    ['dimensões e suas exceções', ANCORAS_DIMENSOES],
    ['adicionais', ANCORAS_ADICIONAIS],
  ])('%s', (_familia, ancoras) => {
    it.each(ancoras)('%s', (_nome, respostas, servico, esperado) => {
      const resultado = calcularPreco(tabela, servico, {
        ...MINIMO,
        ...respostas,
      })
      expect(resultado.mensalCentavos).toBe(esperado)
    })
  })

  it('o perfil com que a página abre custa o que sempre custou', () => {
    expect(respostasIniciais(tabela)).toEqual(PERFIL_PADRAO)

    const esperado: Record<string, number> = {
      padrao: 26000,
      consultiva: 33500,
      juridico: 17000,
      combo: 43000,
    }
    for (const [servico, mensal] of Object.entries(esperado)) {
      expect(calcularPreco(tabela, servico, PERFIL_PADRAO).mensalCentavos).toBe(mensal)
    }
  })

  it('os prazos aplicam 0%, 8% e 15% e devolvem o total do período', () => {
    const consultiva = calcularPreco(tabela, 'consultiva', PERFIL_PADRAO)

    expect(consultiva.periodos).toEqual([
      expect.objectContaining({
        periodo: 'mensal',
        meses: 1,
        descontoPercentual: 0,
        mensalCentavos: 33500,
        economiaMensalCentavos: 0,
        totalPeriodoCentavos: 33500,
      }),
      expect.objectContaining({
        periodo: 'seis_meses',
        meses: 6,
        descontoPercentual: 8,
        mensalCentavos: 31000,
        economiaMensalCentavos: 2500,
        totalPeriodoCentavos: 186000,
      }),
      expect.objectContaining({
        periodo: 'doze_meses',
        meses: 12,
        descontoPercentual: 15,
        mensalCentavos: 28500,
        economiaMensalCentavos: 5000,
        totalPeriodoCentavos: 342000,
      }),
    ])
  })

  it('o Pacote soma os componentes e devolve a economia já calculada', () => {
    const combo = calcularPreco(tabela, 'combo', PERFIL_PADRAO)
    const consultiva = calcularPreco(tabela, 'consultiva', PERFIL_PADRAO)
    const juridico = calcularPreco(tabela, 'juridico', PERFIL_PADRAO)

    expect(combo.combo).toEqual({
      componentes: [consultiva, juridico],
      separadoCentavos: 50500,
      economiaMensalCentavos: 7500,
      economiaAnualCentavos: 90000,
      descontoMilesimos: 150,
    })
    expect(combo.mensalCentavos).toBe(43000)
    // A soma dos componentes menos o desconto é o total: a tela não precisa
    // refazer nenhuma dessas contas.
    expect(combo.linhas.reduce((t, l) => t + l.valorCentavos, 0)).toBe(43000)
  })

  it('a composição explica o preço linha a linha', () => {
    const consultiva = calcularPreco(tabela, 'consultiva', PERFIL_PADRAO)

    expect(
      consultiva.linhas.map((l) => [rotuloDaLinha(l, 'contabil'), l.valorCentavos]),
    ).toEqual([
      ['Preço base', 26500],
      ['Funcionários (3)', 2400],
      ['Emissão de notas fiscais', 2500],
    ])
    expect(consultiva.fatores.map((f) => [f.dimensao, f.multiplicadorMilesimos])).toEqual([
      ['atividade', 1000],
      ['atendimento', 1070],
      ['rotina', 1000],
    ])
    // Núcleo 31.400 × 1,07 = 33.598, arredondado para baixo até 33.500.
    expect(consultiva.nucleoCentavos).toBe(33598)
    expect(consultiva.adicionaisCentavos).toBe(0)
    expect(consultiva.arredondamentoCentavos).toBe(-98)

    const juridico = calcularPreco(tabela, 'juridico', PERFIL_PADRAO)
    expect(juridico.linhas.map((l) => rotuloDaLinha(l, 'juridico'))).toEqual([
      'Preço base',
      'Risco trabalhista da equipe',
    ])

    const combo = calcularPreco(tabela, 'combo', PERFIL_PADRAO)
    expect(combo.linhas.map((l) => [rotuloDaLinha(l, ''), l.valorCentavos])).toEqual([
      ['Contabilidade Consultiva', 33500],
      ['Assistência Jurídica', 17000],
      ['Desconto do combo', -7500],
    ])
  })

  it('os adicionais entram pelo valor cheio, sem multiplicador', () => {
    const semAdicional = calcularPreco(tabela, 'padrao', {
      ...MINIMO,
      atendimento: 'prioritario',
    })
    const comAdicional = calcularPreco(tabela, 'padrao', {
      ...MINIMO,
      atendimento: 'prioritario',
      adicionais: ['especialista_dedicado'],
    })
    // R$ 149 cheios, e não R$ 149 × 1,2.
    expect(comAdicional.mensalCentavos - semAdicional.mensalCentavos).toBe(15000)
    expect(comAdicional.adicionaisCentavos).toBe(14900)
  })

  it('arredonda para o múltiplo de R$ 5 mais próximo, empate para cima', () => {
    // O caso em que a versão anterior discordava de si mesma: o valor exato é
    // R$ 1.887,50, mas `1525 * 1.14` em ponto flutuante dá 1738,4999999999998 e
    // o arredondamento caía para baixo. O motor novo calcula em inteiros e
    // cumpre a regra escrita.
    const empate = calcularPreco(tabela, 'consultiva', {
      regime: 'simples',
      atividades: ['servicos'],
      funcionarios: 27,
      notasFiscais: 'mais250',
      emissor: 'vincis',
      faturamento: '500ka1m',
      atendimento: 'digital',
      rotina: 'vincis',
      adicionais: ['especialista_dedicado'],
    })
    expect(empate.nucleoCentavos + empate.adicionaisCentavos).toBe(188750)
    expect(empate.mensalCentavos).toBe(189000)

    // Os três casos do enunciado da regra, em centavos.
    const passo = tabela.parametros.arredondamentoCentavos
    expect(passo).toBe(500)
    expect(arredondarParaMultiplo(exato(6900), passo)).toBe(7000)
    expect(arredondarParaMultiplo(exato(7200), passo)).toBe(7000)
    expect(arredondarParaMultiplo(exato(7300), passo)).toBe(7500)
    // E o preço-base do Jurídico MEI é justamente o R$ 69 que vira R$ 70.
    expect(
      calcularPreco(tabela, 'juridico', { ...MINIMO, regime: 'mei' }).linhas[0]
        .valorCentavos,
    ).toBe(7000)
  })

  it('calcula todos os serviços de uma vez, na ordem da vitrine', () => {
    const todos = calcularPrecos(tabela, PERFIL_PADRAO)
    expect(todos.map((r) => [r.servico, r.mensalCentavos])).toEqual([
      ['padrao', 26000],
      ['consultiva', 33500],
      ['juridico', 17000],
      ['combo', 43000],
    ])
  })

  describe('configuração ou resposta inválida não vira preço', () => {
    const esperarErro = (
      respostas: RespostasPrecificacao,
      servico: string,
      codigo: string,
    ) => {
      expect(() => calcularPreco(tabela, servico, respostas)).toThrowError(
        ErroPrecificacao,
      )
      try {
        calcularPreco(tabela, servico, respostas)
      } catch (erro) {
        expect((erro as ErroPrecificacao).codigo).toBe(codigo)
      }
    }

    it('serviço inexistente', () => {
      esperarErro(MINIMO, 'plano_ouro', 'servico_desconhecido')
    })

    it('regime sem preço-base', () => {
      esperarErro({ ...MINIMO, regime: 'lucro_arbitrado' }, 'padrao', 'preco_base_ausente')
    })

    it('faixa de notas inexistente', () => {
      esperarErro({ ...MINIMO, notasFiscais: 'ate5' }, 'padrao', 'faixa_desconhecida')
    })

    it('faixa de faturamento inexistente', () => {
      esperarErro({ ...MINIMO, faturamento: 'ate10k' }, 'padrao', 'faixa_desconhecida')
    })

    it('opção de dimensão inexistente', () => {
      esperarErro({ ...MINIMO, atendimento: 'telepatia' }, 'padrao', 'opcao_desconhecida')
    })

    it('dimensão sem resposta', () => {
      esperarErro({ ...MINIMO, atividades: [] }, 'padrao', 'resposta_ausente')
    })

    it('adicional inexistente', () => {
      esperarErro({ ...MINIMO, adicionais: ['cafe'] }, 'padrao', 'adicional_desconhecido')
    })

    it('quantidade de funcionários impossível', () => {
      esperarErro({ ...MINIMO, funcionarios: -1 }, 'padrao', 'quantidade_invalida')
      esperarErro({ ...MINIMO, funcionarios: 2.5 }, 'padrao', 'quantidade_invalida')
    })

    it('preço-base ausente na configuração', () => {
      const semReal: TabelaPrecificacao = {
        ...tabela,
        precosBase: tabela.precosBase.filter((p) => p.regime !== 'real'),
      }
      expect(() =>
        calcularPreco(semReal, 'padrao', { ...MINIMO, regime: 'real' }),
      ).toThrowError(/Sem preço-base/)
    })

    it('serviço composto sem desconto configurado', () => {
      const semDesconto: TabelaPrecificacao = {
        ...tabela,
        descontos: tabela.descontos.filter((d) => d.tipo !== 'combo'),
      }
      expect(() => calcularPreco(semDesconto, 'combo', MINIMO)).toThrowError(
        /sem desconto de combo/,
      )
    })

    it('nenhum período configurado', () => {
      const semPeriodos: TabelaPrecificacao = {
        ...tabela,
        descontos: tabela.descontos.filter((d) => d.tipo !== 'periodo'),
      }
      expect(() => calcularPreco(semPeriodos, 'padrao', MINIMO)).toThrowError(
        /Nenhum período/,
      )
    })
  })
})
