import { describe, expect, it } from 'vitest'
import { problemasDaTabela } from '@/features/precificacao/lib/coerencia'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'

/**
 * A grade que está no banco é esta, e não outra.
 *
 * Enquanto a fórmula vivia em código, este arquivo comparava o banco com ela.
 * A fórmula saiu; os números ficaram, escritos aqui em centavos e milésimos.
 * O teste continua respondendo à mesma pergunta — "alguém mexeu na tabela?" —
 * e agora é a única resposta, porque não existe mais uma segunda fonte para
 * conferir contra.
 *
 * Uma falha aqui não é necessariamente um defeito: pode ser um reajuste que o
 * Gestor fez de propósito. É a conversa que ela força que importa.
 */
describe('carga inicial da precificação', () => {
  let tabela: TabelaPrecificacao

  it('a tabela persistida é legível e coerente', async () => {
    tabela = await obterTabelaPrecificacao()
    expect(problemasDaTabela(tabela)).toEqual([])
  })

  it('os quatro tipos de serviço, com origem de preço declarada', () => {
    expect(
      tabela.servicos.map((s) => [
        s.codigo,
        s.nome,
        s.grupoBase,
        s.multiplicadorMilesimos,
        s.componentes,
      ]),
    ).toEqual([
      ['padrao', 'Contabilidade Padrão', 'contabil', 1000, []],
      ['consultiva', 'Contabilidade Consultiva', 'contabil', 1350, []],
      ['juridico', 'Assistência Jurídica', 'juridico', 1000, []],
      ['combo', 'Pacote Empresarial Completo', null, null, ['consultiva', 'juridico']],
    ])
  })

  it('os preços-base por grupo e regime', () => {
    const grade = Object.fromEntries(
      tabela.precosBase.map((p) => [`${p.grupo}/${p.regime}`, p.valorCentavos]),
    )
    expect(grade).toEqual({
      'contabil/mei': 8900,
      'contabil/simples': 19500,
      'contabil/presumido': 38900,
      'contabil/real': 74900,
      'juridico/mei': 6900,
      'juridico/simples': 14900,
      'juridico/presumido': 22900,
      'juridico/real': 37900,
    })
  })

  it('as dimensões, os grupos a que se aplicam e seus multiplicadores', () => {
    expect(
      tabela.dimensoes.map((d) => [d.codigo, d.aplicaAGrupos, d.selecao]),
    ).toEqual([
      ['regime', ['contabil', 'juridico'], 'unica'],
      ['atividade', ['contabil'], 'multipla'],
      ['emissor', ['contabil'], 'unica'],
      ['atendimento', ['contabil', 'juridico'], 'unica'],
      ['rotina', ['contabil'], 'unica'],
    ])

    const fatores = Object.fromEntries(
      tabela.dimensoes.flatMap((d) =>
        d.opcoes.map((o) => [`${d.codigo}/${o.codigo}`, o.multiplicadorMilesimos]),
      ),
    )
    expect(fatores).toEqual({
      'regime/mei': null,
      'regime/simples': null,
      'regime/presumido': null,
      'regime/real': null,
      'atividade/servicos': 1000,
      'atividade/comercio': 1080,
      'atividade/industria': 1180,
      'emissor/empresa': null,
      'emissor/vincis': null,
      'atendimento/digital': 1000,
      'atendimento/hibrido': 1070,
      'atendimento/prioritario': 1200,
      'rotina/compartilhado': 1000,
      'rotina/vincis': 1140,
    })
  })

  it('as faixas de quantidade, com limites e modo de cobrança', () => {
    // Ordenado por família e limite: a ordem da consulta serve ao motor, não a
    // uma leitura humana.
    const faixas = [...tabela.faixas]
      .sort(
        (a, b) =>
          `${a.grupo}/${a.tipo}`.localeCompare(`${b.grupo}/${b.tipo}`) ||
          a.limiteMin - b.limiteMin,
      )
      .map((f) => [
        `${f.grupo}/${f.tipo}/${f.codigo}`,
        f.limiteMin,
        f.limiteMax,
        f.valorCentavos,
        f.modo,
        f.emissorExigido,
      ])

    expect(faixas).toEqual([
      ['contabil/faturamento/ate50k', 0, 5_000_000, 0, 'fixo', null],
      ['contabil/faturamento/50a150k', 5_000_000, 15_000_000, 6000, 'fixo', null],
      ['contabil/faturamento/150a500k', 15_000_000, 50_000_000, 18_000, 'fixo', null],
      ['contabil/faturamento/500ka1m', 50_000_000, 100_000_000, 34_000, 'fixo', null],
      ['contabil/faturamento/acima1m', 100_000_000, null, 62_000, 'fixo', null],
      ['contabil/funcionarios/excedente', 3, null, 2400, 'por_unidade', null],
      ['contabil/notas_fiscais/ate10', 0, 11, 0, 'fixo', 'vincis'],
      ['contabil/notas_fiscais/11a30', 11, 31, 2500, 'fixo', 'vincis'],
      ['contabil/notas_fiscais/31a100', 31, 101, 7000, 'fixo', 'vincis'],
      ['contabil/notas_fiscais/101a250', 101, 251, 16_000, 'fixo', 'vincis'],
      ['contabil/notas_fiscais/mais250', 251, null, 32_000, 'fixo', 'vincis'],
      ['juridico/funcionarios/excedente', 3, null, 900, 'por_unidade', null],
    ])
  })

  it('os adicionais e seus valores mensais', () => {
    expect(
      tabela.adicionais.map((a) => [a.codigo, a.valorMensalCentavos]),
    ).toEqual([
      ['emissao_extra', 3900],
      ['reuniao_mensal', 5900],
      ['suporte_prioritario', 4900],
      ['especialista_dedicado', 14_900],
    ])
  })

  it('os descontos de prazo e de combo', () => {
    expect(
      tabela.descontos.map((d) => [d.codigo, d.tipo, d.meses, d.descontoMilesimos]),
    ).toEqual([
      ['mensal', 'periodo', 1, 0],
      ['seis_meses', 'periodo', 6, 80],
      ['doze_meses', 'periodo', 12, 150],
      ['combo', 'combo', null, 150],
    ])
  })

  it('os parâmetros gerais', () => {
    expect(tabela.parametros).toEqual({
      arredondamentoCentavos: 500,
      funcionariosPadrao: 3,
    })
  })

  it('o configurador abre com uma resposta marcada por pergunta', () => {
    const padroes = Object.fromEntries(
      tabela.dimensoes.map((d) => [
        d.codigo,
        d.opcoes.filter((o) => o.padrao).map((o) => o.codigo),
      ]),
    )
    expect(padroes).toEqual({
      regime: ['simples'],
      atividade: ['servicos'],
      emissor: ['vincis'],
      atendimento: ['hibrido'],
      rotina: ['compartilhado'],
    })
    expect(
      tabela.faixas
        .filter((f) => f.padrao)
        .map((f) => `${f.tipo}:${f.codigo}`)
        .sort(),
    ).toEqual(['faturamento:ate50k', 'notas_fiscais:11a30'])
  })
})
