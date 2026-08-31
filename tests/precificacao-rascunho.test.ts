import { describe, expect, it } from 'vitest'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import {
  aplicarRascunho,
  chaveDaFaixa,
  chaveDoFator,
  chaveDoPreco,
  paraNumero,
  paraTexto,
  rascunhoDaTabela,
  secaoAlterada,
} from '@/features/precificacao/lib/rascunho'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'

/**
 * O rascunho da tela de Precificação.
 *
 * É o que permite a prévia responder "quanto fica?" **enquanto** o Gestor
 * digita, usando o motor de verdade em vez de uma conta paralela escrita na
 * interface. O que se cobra aqui é justamente isso: que ele produza uma tabela
 * legítima, que não estrague o preço no meio de uma digitação e que não toque
 * em nada além do que foi editado.
 */
describe('rascunho da precificação', () => {
  let tabela: TabelaPrecificacao

  it('espelha exatamente a tabela salva', async () => {
    tabela = await obterTabelaPrecificacao()
    const rascunho = rascunhoDaTabela(tabela)

    // Ida e volta sem alteração: aplicar o rascunho recém-lido devolve a mesma
    // configuração, campo a campo.
    expect(aplicarRascunho(tabela, rascunho)).toEqual(tabela)
    expect(rascunho.precosBase[chaveDoPreco('contabil', 'simples')]).toBe('195')
    // Fatores são mostrados como multiplicador ("1,35x"), que é como a tela de
    // administração compara um ramo com outro. A Server Action continua
    // recebendo porcentagem; a conversão acontece na borda.
    expect(rascunho.acrescimoConsultiva).toBe('1,35')
    expect(rascunho.fatores[chaveDoFator('atividade', 'comercio')]).toBe('1,08')
    expect(rascunho.descontos.doze_meses).toBe('15')
    expect(rascunho.adicionais.reuniao_mensal).toEqual({ valor: '59', ativo: true })
  })

  it('o preço simulado é o mesmo que o motor daria depois de salvar', () => {
    const perfil = respostasIniciais(tabela)
    const rascunho = {
      ...rascunhoDaTabela(tabela),
      precosBase: {
        ...rascunhoDaTabela(tabela).precosBase,
        [chaveDoPreco('contabil', 'simples')]: '210',
      },
    }

    const simulada = aplicarRascunho(tabela, rascunho)
    expect(calcularPreco(simulada, 'padrao', perfil).mensalCentavos).toBe(27_500)
    // E a tabela salva continua intocada: o rascunho não persiste nada.
    expect(calcularPreco(tabela, 'padrao', perfil).mensalCentavos).toBe(26_000)
  })

  it('campo vazio ou inválido não derruba o preço da prévia', () => {
    const perfil = respostasIniciais(tabela)
    const base = rascunhoDaTabela(tabela)

    const simularCom = (texto: string) =>
      calcularPreco(
        aplicarRascunho(tabela, {
          ...base,
          precosBase: {
            ...base.precosBase,
            [chaveDoPreco('contabil', 'simples')]: texto,
          },
        }),
        'padrao',
        perfil,
      ).mensalCentavos

    // Apagar o campo para redigitar, ou deixar cair um caractere solto, não
    // pode fazer a prévia piscar zero: o valor gravado segura o lugar.
    for (const intermediario of ['', '   ', '-', 'abc']) {
      expect(simularCom(intermediario), JSON.stringify(intermediario)).toBe(26_000)
    }

    // Um número parcial, porém legítimo, é usado como está — a prévia segue o
    // que a pessoa digitou até ali, e assenta quando ela termina. "1," lê como
    // "1", que é o que ela de fato escreveu.
    expect(simularCom('1')).toBe(simularCom('1,'))
    expect(simularCom('210')).toBe(27_500)
  })

  it('a vírgula do teclado brasileiro é aceita', () => {
    expect(paraNumero('210,5')).toBe(210.5)
    expect(paraNumero('210.5')).toBe(210.5)
    expect(paraTexto(210.5)).toBe('210,5')

    const base = rascunhoDaTabela(tabela)
    const simulada = aplicarRascunho(tabela, {
      ...base,
      precosBase: { ...base.precosBase, [chaveDoPreco('contabil', 'simples')]: '210,5' },
    })
    expect(
      simulada.precosBase.find((p) => p.grupo === 'contabil' && p.regime === 'simples')
        ?.valorCentavos,
    ).toBe(21_050)
  })

  it('editar uma seção não mexe em nenhuma outra', () => {
    const base = rascunhoDaTabela(tabela)
    const comFator = {
      ...base,
      fatores: { ...base.fatores, [chaveDoFator('atividade', 'industria')]: '1,25' },
    }
    const simulada = aplicarRascunho(tabela, comFator)

    expect(
      simulada.dimensoes
        .find((d) => d.codigo === 'atividade')!
        .opcoes.find((o) => o.codigo === 'industria')!.multiplicadorMilesimos,
    ).toBe(1250)
    expect(simulada.precosBase).toEqual(tabela.precosBase)
    expect(simulada.faixas).toEqual(tabela.faixas)
    expect(simulada.descontos).toEqual(tabela.descontos)
    expect(simulada.adicionais).toEqual(tabela.adicionais)
  })

  it('cada seção sabe se tem alteração pendente, e só ela', () => {
    const salvo = rascunhoDaTabela(tabela)
    const editado = {
      ...salvo,
      faixas: {
        ...salvo.faixas,
        [chaveDaFaixa('contabil', 'notas_fiscais', '11a30')]: '99',
      },
    }

    expect(secaoAlterada(editado, salvo, 'notas_fiscais')).toBe(true)
    for (const secao of [
      'precos_base',
      'funcionarios',
      'faturamento',
      'atividade',
      'atendimento',
      'rotina',
      'adicionais',
      'descontos',
    ] as const) {
      expect(secaoAlterada(editado, salvo, secao), secao).toBe(false)
    }
  })

  it('desligar um adicional já aparece na prévia antes de salvar', () => {
    const perfil = { ...respostasIniciais(tabela), adicionais: ['reuniao_mensal'] }
    const base = rascunhoDaTabela(tabela)
    const comAdicional = calcularPreco(tabela, 'padrao', perfil).mensalCentavos

    const simulada = aplicarRascunho(tabela, {
      ...base,
      adicionais: {
        ...base.adicionais,
        reuniao_mensal: { valor: '79', ativo: true },
      },
    })
    // R$ 59 → R$ 79: vinte reais cheios, porque adicional não recebe fator.
    expect(calcularPreco(simulada, 'padrao', perfil).mensalCentavos).toBe(
      comAdicional + 2000,
    )
  })
})
