import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  precificacaoAdicionais,
  precificacaoDescontos,
  precificacaoFaixas,
  precificacaoOpcoes,
  precificacaoPrecosBase,
  precificacaoServicos,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import {
  RECURSOS_ADMIN,
  recursosPermitidos,
  rotaExigeGestor,
} from '@/features/admin/constants/recursos'
import {
  salvarAdicionais,
  salvarDescontos,
  salvarFaixas,
  salvarFatores,
  salvarPrecosBase,
} from '@/features/precificacao/actions/precificacao'
import { problemasDaTabela } from '@/features/precificacao/lib/coerencia'
import {
  acrescimoPercentual,
  centavosParaReais,
  descontoPercentual,
} from '@/features/precificacao/lib/conversao'
import { impressaoDaSecao } from '@/features/precificacao/lib/impressao'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario, type Persona } from './setup/personas'

/**
 * A Precificação administrada pelo Gestor.
 *
 * O que este arquivo cobra é o caminho inteiro: quem pode abrir, quem pode
 * gravar, o que acontece com as unidades no meio do caminho e o que a página
 * pública passa a cobrar depois. A tela não aparece aqui porque a tela não
 * autoriza nada — esconder um menu não impede ninguém de chamar a action.
 */

let cenario: Cenario
/** A configuração original, restaurada ao fim para não contaminar a suíte. */
let original: TabelaPrecificacao

const NAO_GESTORES: Persona[] = [
  'proprietario',
  'adminProfissional',
  'adminColaborador',
  'profissionalSozinho',
  'colaboradorSozinho',
  'estranho',
]

async function tabela() {
  return obterTabelaPrecificacao()
}

/** Devolve o banco ao estado em que a suíte o encontrou. */
async function restaurar() {
  for (const preco of original.precosBase) {
    await db
      .update(precificacaoPrecosBase)
      .set({ valorCentavos: preco.valorCentavos })
      .where(
        and(
          eq(precificacaoPrecosBase.grupo, preco.grupo),
          eq(precificacaoPrecosBase.regime, preco.regime),
        ),
      )
  }
  for (const servico of original.servicos) {
    await db
      .update(precificacaoServicos)
      .set({ multiplicadorMilesimos: servico.multiplicadorMilesimos })
      .where(eq(precificacaoServicos.codigo, servico.codigo))
  }
  await db.delete(precificacaoFaixas).where(eq(precificacaoFaixas.codigo, 'intruso'))
  for (const faixa of original.faixas) {
    await db
      .update(precificacaoFaixas)
      .set({ valorCentavos: faixa.valorCentavos })
      .where(
        and(
          eq(precificacaoFaixas.grupo, faixa.grupo),
          eq(precificacaoFaixas.tipo, faixa.tipo),
          eq(precificacaoFaixas.codigo, faixa.codigo),
        ),
      )
  }
  for (const dimensao of original.dimensoes) {
    for (const opcao of dimensao.opcoes) {
      await db
        .update(precificacaoOpcoes)
        .set({ multiplicadorMilesimos: opcao.multiplicadorMilesimos })
        .where(
          and(
            eq(precificacaoOpcoes.dimensaoCodigo, dimensao.codigo),
            eq(precificacaoOpcoes.codigo, opcao.codigo),
          ),
        )
    }
  }
  for (const adicional of original.adicionais) {
    await db
      .update(precificacaoAdicionais)
      .set({
        valorMensalCentavos: adicional.valorMensalCentavos,
        ativo: adicional.ativo,
      })
      .where(eq(precificacaoAdicionais.codigo, adicional.codigo))
  }
  for (const desconto of original.descontos) {
    await db
      .update(precificacaoDescontos)
      .set({ descontoMilesimos: desconto.descontoMilesimos })
      .where(eq(precificacaoDescontos.codigo, desconto.codigo))
  }
}

beforeAll(async () => {
  cenario = await montarCenario()
  original = await tabela()
})

afterAll(async () => {
  sairDaSessao()
  await restaurar()
  // O rastro de auditoria aponta para a conta do Gestor de teste; sem apagá-lo
  // a limpeza do cenário esbarra na chave estrangeira.
  await db
    .delete(eventosAuditoria)
    .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))
  await limparCenario()
})

describe('acesso ao módulo', () => {
  it('a Precificação é um recurso exclusivo do Gestor', () => {
    expect(rotaExigeGestor('/admin/precificacao')).toBe(true)
    expect(rotaExigeGestor('/admin/precificacao/qualquer-coisa')).toBe(true)

    const doGestor = recursosPermitidos({ ehGestor: true }).map((r) => r.rota)
    const dosOutros = recursosPermitidos({ ehGestor: false }).map((r) => r.rota)
    expect(doGestor).toContain('/admin/precificacao')
    expect(dosOutros).not.toContain('/admin/precificacao')
    // Desktop e mobile leem esta mesma lista: um item nunca aparece só num deles.
    expect(RECURSOS_ADMIN.some((r) => r.id === 'precificacao')).toBe(true)
  })
})

describe('quem não é Gestor não altera preço', () => {
  const chamadas = [
    ['preços-base', () => salvarPrecosBase({ impressao: 'x', precos: [], acrescimoConsultiva: 35 })],
    ['faixas', () => salvarFaixas({ impressao: 'x', tipo: 'faturamento', faixas: [] })],
    ['fatores', () => salvarFatores({ impressao: 'x', dimensao: 'atividade', opcoes: [] })],
    ['adicionais', () => salvarAdicionais({ impressao: 'x', adicionais: [] })],
    ['descontos', () => salvarDescontos({ impressao: 'x', descontos: [] })],
  ] as const

  it('nenhuma action aceita chamada direta de outro perfil', async () => {
    for (const persona of NAO_GESTORES) {
      entrarComo(cenario.tokens[persona])
      for (const [nome, chamar] of chamadas) {
        const resultado = await chamar()
        expect(resultado.sucesso, `${persona} → ${nome}`).toBe(false)
        expect(resultado.mensagem, `${persona} → ${nome}`).toBe(
          'Operação não autorizada.',
        )
      }
    }
  })

  it('sem sessão também não passa', async () => {
    sairDaSessao()
    for (const [, chamar] of chamadas) {
      expect((await chamar()).sucesso).toBe(false)
    }
  })

  it('e nada foi alterado no banco', async () => {
    expect(await tabela()).toEqual(original)
  })
})

describe('o Gestor edita a precificação', () => {
  beforeAll(() => {
    entrarComo(cenario.tokens.gestor)
  })

  it('preço em reais é gravado em centavos e volta em reais', async () => {
    const antes = await tabela()
    const resultado = await salvarPrecosBase({
      impressao: impressaoDaSecao(antes, 'precos_base'),
      precos: [{ grupo: 'contabil', regime: 'simples', valorReais: 210.5 }],
      acrescimoConsultiva: 35,
    })
    expect(resultado.sucesso).toBe(true)

    const [linha] = await db
      .select({ valor: precificacaoPrecosBase.valorCentavos })
      .from(precificacaoPrecosBase)
      .where(
        and(
          eq(precificacaoPrecosBase.grupo, 'contabil'),
          eq(precificacaoPrecosBase.regime, 'simples'),
        ),
      )
    expect(linha.valor).toBe(21_050)
    expect(centavosParaReais(linha.valor)).toBe(210.5)

    const depois = await tabela()
    expect(
      depois.precosBase.find((p) => p.grupo === 'contabil' && p.regime === 'simples')
        ?.valorCentavos,
    ).toBe(21_050)
  })

  it('porcentagem digitada volta como a mesma porcentagem', async () => {
    const antes = await tabela()
    expect(
      (
        await salvarPrecosBase({
          impressao: impressaoDaSecao(antes, 'precos_base'),
          precos: [{ grupo: 'contabil', regime: 'simples', valorReais: 210.5 }],
          acrescimoConsultiva: 42.5,
        })
      ).sucesso,
    ).toBe(true)

    const [servico] = await db
      .select({ fator: precificacaoServicos.multiplicadorMilesimos })
      .from(precificacaoServicos)
      .where(eq(precificacaoServicos.codigo, 'consultiva'))
    // 42,5% a mais é o fator 1,425×.
    expect(servico.fator).toBe(1425)
    expect(acrescimoPercentual(servico.fator!)).toBe(42.5)
  })

  it('desconto de prazo e de pacote fazem o mesmo caminho', async () => {
    const antes = await tabela()
    const resultado = await salvarDescontos({
      impressao: impressaoDaSecao(antes, 'descontos'),
      descontos: [
        { codigo: 'mensal', percentual: 0 },
        { codigo: 'seis_meses', percentual: 8 },
        { codigo: 'doze_meses', percentual: 20 },
        { codigo: 'combo', percentual: 12.5 },
      ],
    })
    expect(resultado.sucesso).toBe(true)

    const depois = await tabela()
    const porCodigo = Object.fromEntries(
      depois.descontos.map((d) => [d.codigo, d.descontoMilesimos]),
    )
    expect(porCodigo).toEqual({
      mensal: 0,
      seis_meses: 80,
      doze_meses: 200,
      combo: 125,
    })
    expect(descontoPercentual(porCodigo.doze_meses)).toBe(20)
    expect(descontoPercentual(porCodigo.combo)).toBe(12.5)
  })

  it('um conjunto de faixas válido é gravado inteiro', async () => {
    const antes = await tabela()
    const notas = antes.faixas.filter((f) => f.tipo === 'notas_fiscais')
    const resultado = await salvarFaixas({
      impressao: impressaoDaSecao(antes, 'notas_fiscais'),
      tipo: 'notas_fiscais',
      faixas: notas.map((f, i) => ({
        grupo: f.grupo,
        codigo: f.codigo,
        valorReais: i * 10,
      })),
    })
    expect(resultado.sucesso).toBe(true)

    const depois = await tabela()
    expect(
      depois.faixas
        .filter((f) => f.tipo === 'notas_fiscais')
        .sort((a, b) => a.limiteMin - b.limiteMin)
        .map((f) => f.valorCentavos),
    ).toEqual(
      notas
        .sort((a, b) => a.limiteMin - b.limiteMin)
        .map((_, i) => i * 1000),
    )
  })

  it('acréscimo de ramo salva e o motor passa a usá-lo', async () => {
    const antes = await tabela()
    expect(
      (
        await salvarFatores({
          impressao: impressaoDaSecao(antes, 'fatores:atividade'),
          dimensao: 'atividade',
          opcoes: [
            { codigo: 'servicos', acrescimoPercentual: 0 },
            { codigo: 'comercio', acrescimoPercentual: 8 },
            { codigo: 'industria', acrescimoPercentual: 25 },
          ],
        })
      ).sucesso,
    ).toBe(true)

    const depois = await tabela()
    const industria = depois.dimensoes
      .find((d) => d.codigo === 'atividade')!
      .opcoes.find((o) => o.codigo === 'industria')!
    expect(industria.multiplicadorMilesimos).toBe(1250)
  })

  it('adicional pode mudar de preço e sair da vitrine', async () => {
    const antes = await tabela()
    const resultado = await salvarAdicionais({
      impressao: impressaoDaSecao(antes, 'adicionais'),
      adicionais: antes.adicionais.map((a) => ({
        codigo: a.codigo,
        valorReais: a.codigo === 'reuniao_mensal' ? 79 : centavosParaReais(a.valorMensalCentavos),
        ativo: a.codigo !== 'emissao_extra',
      })),
    })
    expect(resultado.sucesso).toBe(true)

    const depois = await tabela()
    const porCodigo = Object.fromEntries(
      depois.adicionais.map((a) => [a.codigo, a]),
    )
    expect(porCodigo.reuniao_mensal.valorMensalCentavos).toBe(7900)
    expect(porCodigo.emissao_extra.ativo).toBe(false)
  })

  it('cada alteração deixa registro de quem a fez', async () => {
    await db
      .delete(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))

    const antes = await tabela()
    expect(
      (
        await salvarFatores({
          impressao: impressaoDaSecao(antes, 'fatores:rotina'),
          dimensao: 'rotina',
          opcoes: [
            { codigo: 'compartilhado', acrescimoPercentual: 0 },
            { codigo: 'vincis', acrescimoPercentual: 16 },
          ],
        })
      ).sucesso,
    ).toBe(true)

    const registros = await db
      .select()
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))

    expect(registros).toHaveLength(1)
    expect(registros[0].autorId).toBe(cenario.ids.gestor)
    expect(registros[0].entidade).toBe('precificacao')
    expect(registros[0].origem).toBe('gestao_vincis')
    expect(registros[0].metadados).toMatchObject({ secao: 'fatores:rotina' })
    await restaurar()
  })

  it('a alteração vira preço novo pelo motor central', async () => {
    await restaurar()
    const antes = await tabela()
    const perfil = respostasIniciais(antes)
    const precoAntes = calcularPreco(antes, 'padrao', perfil).mensalCentavos

    expect(
      (
        await salvarPrecosBase({
          impressao: impressaoDaSecao(antes, 'precos_base'),
          precos: [{ grupo: 'contabil', regime: 'simples', valorReais: 210 }],
          acrescimoConsultiva: 35,
        })
      ).sucesso,
    ).toBe(true)

    const depois = await tabela()
    const precoDepois = calcularPreco(depois, 'padrao', perfil).mensalCentavos

    // Base 195 → 210 com o mesmo perfil: 15 reais a mais na base, multiplicados
    // pelo fator de atendimento e arredondados.
    expect(precoAntes).toBe(26_000)
    expect(precoDepois).toBe(27_500)
    await restaurar()
  })
})

describe('o que a Precificação recusa', () => {
  beforeAll(() => {
    entrarComo(cenario.tokens.gestor)
  })

  it('valor negativo e porcentagem impossível não passam do Zod', async () => {
    const antes = await tabela()
    const impressao = impressaoDaSecao(antes, 'precos_base')

    expect(
      await salvarPrecosBase({
        impressao,
        precos: [{ grupo: 'contabil', regime: 'simples', valorReais: -1 }],
        acrescimoConsultiva: 35,
      }),
    ).toEqual({ sucesso: false, mensagem: 'O valor não pode ser negativo.' })

    expect(
      (
        await salvarDescontos({
          impressao: impressaoDaSecao(antes, 'descontos'),
          descontos: [{ codigo: 'doze_meses', percentual: 100 }],
        })
      ).sucesso,
    ).toBe(false)

    expect(await tabela()).toEqual(antes)
  })

  it('a impressão da seção impede que uma sessão apague a decisão da outra', async () => {
    const antes = await tabela()
    const impressaoAntiga = impressaoDaSecao(antes, 'descontos')

    // A primeira sessão salva.
    expect(
      (
        await salvarDescontos({
          impressao: impressaoAntiga,
          descontos: [{ codigo: 'doze_meses', percentual: 18 }],
        })
      ).sucesso,
    ).toBe(true)

    // A segunda ainda está com a tela de antes aberta.
    const conflito = await salvarDescontos({
      impressao: impressaoAntiga,
      descontos: [{ codigo: 'doze_meses', percentual: 11 }],
    })
    expect(conflito.sucesso).toBe(false)
    expect(conflito.mensagem).toContain('alterados em outra sessão')

    const depois = await tabela()
    expect(
      depois.descontos.find((d) => d.codigo === 'doze_meses')?.descontoMilesimos,
    ).toBe(180)
    await restaurar()
  })

  it('com a tabela incoerente, nada é gravado', async () => {
    // Uma faixa a mais, sobreposta às que já existem: exatamente o defeito que
    // nenhum `check` de linha consegue enxergar sozinho.
    await db.insert(precificacaoFaixas).values({
      grupo: 'contabil',
      tipo: 'faturamento',
      codigo: 'intruso',
      rotulo: 'Faixa sobreposta',
      limiteMin: 0,
      limiteMax: 5_000_000,
      valorCentavos: 1000,
      modo: 'fixo',
      ordem: 99,
    })

    // A leitura falha alto em vez de devolver uma configuração meio quebrada —
    // é o mesmo comportamento que impede `/precos` de exibir preço errado.
    await expect(tabela()).rejects.toThrow(/incoerente/)

    const antesDaTentativa = await db.select().from(precificacaoDescontos)
    const resultado = await salvarDescontos({
      impressao: 'qualquer',
      descontos: [{ codigo: 'doze_meses', percentual: 15 }],
    })
    expect(resultado.sucesso).toBe(false)
    expect(await db.select().from(precificacaoDescontos)).toEqual(antesDaTentativa)

    await restaurar()
    expect(problemasDaTabela(await tabela())).toEqual([])
  })
})

describe('a conferência de coerência enxerga faixa quebrada', () => {
  it('acusa sobreposição, lacuna e família sem teto', () => {
    const familia = original.faixas.filter(
      (f) => f.grupo === 'contabil' && f.tipo === 'faturamento',
    )
    const outras = original.faixas.filter(
      (f) => !(f.grupo === 'contabil' && f.tipo === 'faturamento'),
    )

    const sobreposta = familia.map((f, i) =>
      i === 1 ? { ...f, limiteMin: f.limiteMin - 1000 } : f,
    )
    expect(
      problemasDaTabela({ ...original, faixas: [...outras, ...sobreposta] }).join(' '),
    ).toContain('sobreposição')

    const comLacuna = familia.map((f, i) =>
      i === 1 ? { ...f, limiteMin: f.limiteMin + 1000 } : f,
    )
    expect(
      problemasDaTabela({ ...original, faixas: [...outras, ...comLacuna] }).join(' '),
    ).toContain('lacuna')

    const comTeto = familia.map((f, i) =>
      i === familia.length - 1 ? { ...f, limiteMax: 999_000_000 } : f,
    )
    expect(
      problemasDaTabela({ ...original, faixas: [...outras, ...comTeto] }).join(' '),
    ).toContain('sem teto')
  })
})
