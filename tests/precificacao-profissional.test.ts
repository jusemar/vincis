import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  precificacaoProfissional,
  precificacaoProfissionalValores,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { calcularPreco, calcularPrecos } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import {
  despublicarPrecos,
  publicarPrecos,
  salvarRascunhoDePrecos,
} from '@/features/precificacao-profissional/actions/precificacao-profissional'
import {
  ARREDONDAMENTO_DO_PROFISSIONAL,
  SERVICO_DO_PROFISSIONAL,
} from '@/features/precificacao-profissional/constants/precificacao-profissional'
import {
  chaveDaFaixa,
  chaveDoFator,
  impressaoDosValores,
  linhasDosValores,
  valoresDeReferencia,
} from '@/features/precificacao-profissional/lib/grade'
import {
  rascunhoDosValores,
  valoresDoRascunho,
} from '@/features/precificacao-profissional/lib/rascunho'
import {
  primeiroNomeDe,
  tabelaDoProfissional,
} from '@/features/precificacao-profissional/lib/tabela-do-profissional'
import {
  obterConfiguracaoDoProfissional,
  temPrecosPublicados,
} from '@/features/precificacao-profissional/queries/obter-configuracao'
import { obterPrecificacaoPublicaDoProfissional } from '@/features/precificacao-profissional/queries/precificacao-publica'
import type { ValoresDoProfissional } from '@/features/precificacao-profissional/types/precificacao-profissional'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

/**
 * A precificação individual do Profissional.
 *
 * O arquivo cobra três coisas, e a primeira é a mais importante: **a
 * precificação da Vincis não pode mudar por causa disto**. Depois, que o preço
 * de cada Profissional é dele e de mais ninguém; e por último, que rascunho não
 * vaza para a página pública e que só o dono edita o próprio preço.
 */

let cenario: Cenario
let estrutura: TabelaPrecificacao

/** Perfis de empresa usados nas conferências. */
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

const COMPLETO: RespostasPrecificacao = {
  regime: 'presumido',
  atividades: ['industria'],
  funcionarios: 7,
  notasFiscais: '31a100',
  emissor: 'vincis',
  faturamento: '150a500k',
  atendimento: 'prioritario',
  rotina: 'vincis',
  adicionais: [],
}

/** Os valores como as Server Actions os recebem: reais e porcentagem. */
function entradaDe(valores: ValoresDoProfissional) {
  return {
    valores: {
      precosBase: Object.entries(valores.precosBase).map(([chave, centavos]) => ({
        chave,
        valorReais: centavos / 100,
      })),
      faixas: Object.entries(valores.faixas).map(([chave, centavos]) => ({
        chave,
        valorReais: centavos / 100,
      })),
      fatores: Object.entries(valores.fatores).map(([chave, milesimos]) => ({
        chave,
        acrescimoPercentual: (milesimos - 1000) / 10,
        acrescimoFixoReais:
          chave in valores.acrescimosFixos
            ? valores.acrescimosFixos[chave] / 100
            : null,
      })),
    },
  }
}

/** A referência da grade, com alguns valores trocados. */
function valoresCom(
  ajustes: Partial<{
    precosBase: Record<string, number>
    faixas: Record<string, number>
    fatores: Record<string, number>
    acrescimosFixos: Record<string, number>
  }>,
): ValoresDoProfissional {
  const base = valoresDeReferencia(estrutura)
  return {
    precosBase: { ...base.precosBase, ...ajustes.precosBase },
    faixas: { ...base.faixas, ...ajustes.faixas },
    fatores: { ...base.fatores, ...ajustes.fatores },
    acrescimosFixos: { ...base.acrescimosFixos, ...ajustes.acrescimosFixos },
  }
}

/** O retrato da precificação da Vincis: configuração e preços calculados. */
function retratoDaVincis(tabela: TabelaPrecificacao) {
  const cenarios: RespostasPrecificacao[] = [
    respostasIniciais(tabela),
    MINIMO,
    COMPLETO,
    { ...COMPLETO, regime: 'mei', funcionarios: 0 },
    { ...COMPLETO, regime: 'real', funcionarios: 42, notasFiscais: 'mais250' },
  ]

  return JSON.stringify({
    configuracao: tabela,
    precos: cenarios.map((respostas) => calcularPrecos(tabela, respostas)),
  })
}

let retratoAntes: string

beforeAll(async () => {
  cenario = await montarCenario()
  estrutura = await obterTabelaPrecificacao()
  retratoAntes = retratoDaVincis(estrutura)
})

afterAll(async () => {
  sairDaSessao()
  await db.delete(precificacaoProfissionalValores)
  await db.delete(precificacaoProfissional)
  // O rastro de auditoria aponta para as contas de teste; sem apagá-lo a
  // limpeza do cenário esbarra na chave estrangeira.
  await db
    .delete(eventosAuditoria)
    .where(
      inArray(eventosAuditoria.acao, [
        ACOES_AUDITORIA.precificacaoProfissionalSalva,
        ACOES_AUDITORIA.precificacaoProfissionalPublicada,
      ]),
    )
  await limparCenario()
})

/* ------------------------------------------------------------- a derivação */

describe('a tabela derivada do Profissional', () => {
  it('tem um serviço só, e é a contabilidade mensal', () => {
    const tabela = tabelaDoProfissional(estrutura, valoresDeReferencia(estrutura), {
      primeiroNome: 'João',
    })

    expect(tabela.servicos).toHaveLength(1)
    expect(tabela.servicos[0].codigo).toBe(SERVICO_DO_PROFISSIONAL)
    expect(tabela.servicos[0].nome).toBe('Contabilidade mensal')
    expect(tabela.servicos[0].componentes).toEqual([])
  })

  it('não tem adicional, combo, semestral, anual nem desconto de prazo', () => {
    const tabela = tabelaDoProfissional(estrutura, valoresDeReferencia(estrutura), {
      primeiroNome: 'João',
    })

    expect(tabela.adicionais).toEqual([])
    expect(tabela.descontos).toHaveLength(1)
    expect(tabela.descontos[0]).toMatchObject({
      codigo: 'mensal',
      tipo: 'periodo',
      meses: 1,
      descontoMilesimos: 0,
      servicoCodigo: null,
    })

    const resultado = calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, MINIMO)
    expect(resultado.combo).toBeNull()
    expect(resultado.periodos).toHaveLength(1)
    expect(resultado.periodos[0].mensalCentavos).toBe(resultado.mensalCentavos)
  })

  it('não carrega nada da grade jurídica', () => {
    const tabela = tabelaDoProfissional(estrutura, valoresDeReferencia(estrutura), {
      primeiroNome: 'João',
    })

    expect(tabela.precosBase.every((p) => p.grupo === 'contabil')).toBe(true)
    expect(tabela.faixas.every((f) => f.grupo === 'contabil')).toBe(true)
    expect(
      tabela.dimensoes.every((d) => d.aplicaAGrupos.every((g) => g === 'contabil')),
    ).toBe(true)
  })

  it('não repete texto da Vincis nas respostas do configurador', () => {
    const tabela = tabelaDoProfissional(estrutura, valoresDeReferencia(estrutura), {
      primeiroNome: 'Maria',
    })

    const textos = tabela.dimensoes
      .flatMap((d) => d.opcoes.map((o) => `${o.rotulo} ${o.ajuda ?? ''}`))
      .join(' ')

    expect(textos.toLowerCase()).not.toContain('vincis')
    expect(textos).toContain('Maria')
  })

  it('trata o profissional pelo nome, e não pelo título', () => {
    expect(primeiroNomeDe('Dr. Ricardo Mendes')).toBe('Ricardo')
    expect(primeiroNomeDe('Dra. Ana Carolina Silva')).toBe('Ana')
    expect(primeiroNomeDe('DRA Ana Carolina Silva')).toBe('Ana')
    expect(primeiroNomeDe('Profissional de Teste')).toBe('Profissional')
    // Sem nome depois do título, o título é tudo o que há para chamar.
    expect(primeiroNomeDe('Dra.')).toBe('Dra.')
    expect(primeiroNomeDe('   ')).toBe('')
  })

  it('parte do preço-base do regime, sem multiplicar por serviço nenhum', () => {
    const tabela = tabelaDoProfissional(
      estrutura,
      valoresCom({ precosBase: { simples: 18_000 } }),
      { primeiroNome: 'João' },
    )

    const resultado = calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, MINIMO)
    expect(resultado.linhas[0]).toEqual({ tipo: 'base', valorCentavos: 18_000 })
    expect(resultado.mensalCentavos).toBe(18_000)
  })

  it('arredonda para o real, e não para o múltiplo de R$ 5 da Vincis', () => {
    expect(ARREDONDAMENTO_DO_PROFISSIONAL).toBe(100)

    const tabela = tabelaDoProfissional(
      estrutura,
      valoresCom({ precosBase: { simples: 18_200 } }),
      { primeiroNome: 'João' },
    )

    const resultado = calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, MINIMO)
    expect(resultado.mensalCentavos).toBe(18_200)
  })

  it('aplica ramo, funcionários, notas, faturamento, atendimento e rotina', () => {
    const so_base = tabelaDoProfissional(
      estrutura,
      valoresCom({ precosBase: { presumido: 30_000 } }),
      { primeiroNome: 'João' },
    )

    const minimo = calcularPreco(so_base, SERVICO_DO_PROFISSIONAL, {
      ...MINIMO,
      regime: 'presumido',
    })
    const completo = calcularPreco(so_base, SERVICO_DO_PROFISSIONAL, COMPLETO)

    // Cada variável do perfil só pode somar; nenhuma delas some da conta.
    expect(completo.mensalCentavos).toBeGreaterThan(minimo.mensalCentavos)
    expect(completo.linhas.map((l) => l.tipo)).toEqual([
      'base',
      'funcionarios',
      'notas_fiscais',
      'faturamento',
    ])
    expect(completo.fatores.map((f) => f.dimensao)).toEqual([
      'atividade',
      'atendimento',
      'rotina',
    ])
  })
})

/* ------------------------------------------------ preços independentes */

describe('cada Profissional tem o preço dele', () => {
  it('dois profissionais cobram valores diferentes pelo mesmo perfil', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    expect(
      (await publicarPrecos(entradaDe(valoresCom({ precosBase: { simples: 18_000 } }))))
        .sucesso,
    ).toBe(true)

    entrarComo(cenario.tokens.estranho)
    expect(
      (await publicarPrecos(entradaDe(valoresCom({ precosBase: { simples: 24_000 } }))))
        .sucesso,
    ).toBe(true)
    sairDaSessao()

    const joao = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    const maria = await obterPrecificacaoPublicaDoProfissional(cenario.ids.estranho)

    expect(joao).not.toBeNull()
    expect(maria).not.toBeNull()

    const precoDe = (t: TabelaPrecificacao) =>
      calcularPreco(t, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos

    expect(precoDe(joao!.tabela)).toBe(18_000)
    expect(precoDe(maria!.tabela)).toBe(24_000)
  })

  it('o preço do Profissional não é o da Vincis', async () => {
    const joao = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    const daVincis = calcularPreco(estrutura, 'padrao', MINIMO).mensalCentavos
    const doJoao = calcularPreco(
      joao!.tabela,
      SERVICO_DO_PROFISSIONAL,
      MINIMO,
    ).mensalCentavos

    expect(daVincis).toBe(19_500)
    expect(doJoao).toBe(18_000)
  })

  it('publicar preço não escreve nas tabelas da Vincis', async () => {
    const agora = await obterTabelaPrecificacao()
    expect(retratoDaVincis(agora)).toBe(retratoAntes)
  })
})

/* --------------------------------------------------- rascunho e publicação */

describe('o que está em edição não é o que está no ar', () => {
  it('salvar o rascunho não muda nada na página pública', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    const salvo = await salvarRascunhoDePrecos(
      entradaDe(valoresCom({ precosBase: { simples: 15_000 } })),
    )
    sairDaSessao()

    expect(salvo.sucesso).toBe(true)
    expect(
      await obterPrecificacaoPublicaDoProfissional(cenario.ids.colaboradorSozinho),
    ).toBeNull()
    expect(await temPrecosPublicados(cenario.ids.colaboradorSozinho)).toBe(false)
  })

  it('publicar põe no ar exatamente o que estava em edição', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    await publicarPrecos(entradaDe(valoresCom({ precosBase: { simples: 15_000 } })))
    sairDaSessao()

    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.colaboradorSozinho,
    )
    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos,
    ).toBe(15_000)
  })

  it('alterar o rascunho depois de publicar não mexe no que o cliente vê', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    await salvarRascunhoDePrecos(
      entradaDe(valoresCom({ precosBase: { simples: 99_900 } })),
    )
    const configuracao = await obterConfiguracaoDoProfissional(
      cenario.ids.colaboradorSozinho,
    )
    sairDaSessao()

    expect(configuracao!.rascunho.precosBase.simples).toBe(99_900)
    expect(configuracao!.publicadoValores!.precosBase.simples).toBe(15_000)

    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.colaboradorSozinho,
    )
    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos,
    ).toBe(15_000)
  })

  it('despublicar tira do ar sem apagar o que foi configurado', async () => {
    entrarComo(cenario.tokens.colaboradorSozinho)
    expect((await despublicarPrecos()).sucesso).toBe(true)
    const configuracao = await obterConfiguracaoDoProfissional(
      cenario.ids.colaboradorSozinho,
    )
    sairDaSessao()

    expect(
      await obterPrecificacaoPublicaDoProfissional(cenario.ids.colaboradorSozinho),
    ).toBeNull()
    expect(configuracao!.publicado).toBe(false)
    expect(configuracao!.publicadoValores!.precosBase.simples).toBe(15_000)
    expect(configuracao!.rascunho.precosBase.simples).toBe(99_900)
  })

  it('quem nunca configurou abre com a referência, sem nada gravado', async () => {
    const configuracao = await obterConfiguracaoDoProfissional(
      cenario.ids.proprietario,
    )

    expect(configuracao!.novo).toBe(true)
    expect(configuracao!.publicado).toBe(false)
    expect(configuracao!.publicadoValores).toBeNull()
    expect(impressaoDosValores(configuracao!.rascunho)).toBe(
      impressaoDosValores(valoresDeReferencia(estrutura)),
    )

    const gravadas = await db
      .select()
      .from(precificacaoProfissionalValores)
      .where(eq(precificacaoProfissionalValores.profissionalId, cenario.ids.proprietario))
    expect(gravadas).toHaveLength(0)
  })

  it('registra na auditoria quem publicou e o que ficou gravado', async () => {
    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.autorId, cenario.ids.profissionalSozinho))

    const publicacao = eventos.find(
      (e) => e.acao === ACOES_AUDITORIA.precificacaoProfissionalPublicada,
    )
    expect(publicacao).toBeDefined()
    expect(publicacao!.entidade).toBe('precificacao_profissional')
    expect(String((publicacao!.metadados as Record<string, unknown>).valores)).toContain(
      'preco_base:simples=18000',
    )
  })
})

/* ----------------------------------------------------------------- guardas */

describe('só o dono mexe nos próprios preços', () => {
  it('sem sessão, nada é gravado', async () => {
    sairDaSessao()
    const resultado = await publicarPrecos(entradaDe(valoresDeReferencia(estrutura)))
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('não autorizada')
  })

  it('quem não presta serviço não tem tabela para publicar', async () => {
    entrarComo(cenario.tokens.gestor)
    const resultado = await publicarPrecos(entradaDe(valoresDeReferencia(estrutura)))
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('não autorizada')
    expect(await temPrecosPublicados(cenario.ids.gestor)).toBe(false)
  })

  it('gravar sempre atinge a conta da sessão, e nunca outra', async () => {
    entrarComo(cenario.tokens.adminProfissional)
    await publicarPrecos(entradaDe(valoresCom({ precosBase: { simples: 21_000 } })))
    sairDaSessao()

    const dele = await db
      .select({ chave: precificacaoProfissionalValores.chave })
      .from(precificacaoProfissionalValores)
      .where(
        eq(
          precificacaoProfissionalValores.profissionalId,
          cenario.ids.adminProfissional,
        ),
      )
    expect(dele.length).toBeGreaterThan(0)

    // O preço de quem já tinha publicado segue exatamente onde estava.
    const joao = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    expect(
      calcularPreco(joao!.tabela, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos,
    ).toBe(18_000)
  })

  it('o Gestor que também é Profissional grava na tabela dele, não na da Vincis', async () => {
    const antes = await obterTabelaPrecificacao()

    entrarComo(cenario.tokens.gestorProfissional)
    const resultado = await publicarPrecos(
      entradaDe(valoresCom({ precosBase: { simples: 33_000 } })),
    )
    sairDaSessao()

    expect(resultado.sucesso).toBe(true)
    expect(retratoDaVincis(await obterTabelaPrecificacao())).toBe(
      retratoDaVincis(antes),
    )

    const dele = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.gestorProfissional,
    )
    expect(
      calcularPreco(dele!.tabela, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos,
    ).toBe(33_000)
  })
})

/* ------------------------------------------------------------- conferência */

describe('o que não pode ir ao ar', () => {
  it('preço-base zerado é recusado', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await publicarPrecos(
      entradaDe(valoresCom({ precosBase: { simples: 0 } })),
    )
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    expect(resultado.secao).toBe('precos_base')
  })

  it('acréscimo que anula o preço é recusado', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await publicarPrecos({
      valores: {
        ...entradaDe(valoresDeReferencia(estrutura)).valores,
        fatores: [{ chave: chaveDoFator('atividade', 'comercio'), acrescimoPercentual: -100 }],
      },
    })
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
  })

  it('chave que não existe na grade é recusada', async () => {
    const valores = entradaDe(valoresDeReferencia(estrutura)).valores
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await publicarPrecos({
      valores: {
        ...valores,
        faixas: [...valores.faixas, { chave: 'faturamento/inventada', valorReais: 10 }],
      },
    })
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('mudou de formato')
  })

  it('grade incompleta é recusada', async () => {
    const valores = entradaDe(valoresDeReferencia(estrutura)).valores
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await publicarPrecos({
      valores: {
        ...valores,
        faixas: valores.faixas.filter(
          (f) => f.chave !== chaveDaFaixa('faturamento', 'ate50k'),
        ),
      },
    })
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('mudou de formato')
  })

  it('uma recusa não altera o que já estava publicado', async () => {
    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, MINIMO).mensalCentavos,
    ).toBe(18_000)
  })
})

/* ------------------------------------ acréscimo em porcentagem ou em reais */

describe('a forma de atendimento cobra em % ou em R$', () => {
  /*
    Todo caso abaixo parte de um subtotal de exatamente R$ 300 antes da forma de
    atendimento: preço-base de R$ 300 no Simples e nenhuma outra parcela no
    perfil mínimo. É o cenário do enunciado, e é o que deixa a conta conferível
    de cabeça — 12% são R$ 36, e R$ 20 são R$ 20.
  */
  const SUBTOTAL = 30_000

  const precoCom = (
    ajustes: Parameters<typeof valoresCom>[0],
    respostas: Partial<RespostasPrecificacao> = {},
  ) => {
    const tabela = tabelaDoProfissional(
      estrutura,
      valoresCom({ ...ajustes, precosBase: { simples: SUBTOTAL } }),
      { primeiroNome: 'João' },
    )
    return calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, {
      ...MINIMO,
      ...respostas,
    })
  }

  it('o subtotal antes da forma de atendimento é R$ 300', () => {
    expect(precoCom({}).mensalCentavos).toBe(SUBTOTAL)
  })

  it('híbrido a 12% cobra R$ 36 a mais', () => {
    const resultado = precoCom(
      { fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 } },
      { atendimento: 'hibrido' },
    )

    expect(resultado.mensalCentavos).toBe(33_600)
    expect(resultado.fatores).toContainEqual(
      expect.objectContaining({
        dimensao: 'atendimento',
        opcao: 'hibrido',
        multiplicadorMilesimos: 1120,
        acrescimoCentavos: null,
      }),
    )
  })

  it('híbrido a R$ 20,00 cobra R$ 20 a mais, e não 12%', () => {
    const resultado = precoCom(
      {
        // O percentual continua gravado, e continua sem efeito.
        fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 },
        acrescimosFixos: { [chaveDoFator('atendimento', 'hibrido')]: 2_000 },
      },
      { atendimento: 'hibrido' },
    )

    expect(resultado.mensalCentavos).toBe(32_000)
    expect(resultado.fatores).toContainEqual(
      expect.objectContaining({
        dimensao: 'atendimento',
        opcao: 'hibrido',
        multiplicadorMilesimos: null,
        acrescimoCentavos: 2_000,
      }),
    )
  })

  it('prioritário a 35% cobra R$ 105 a mais', () => {
    expect(
      precoCom(
        { fatores: { [chaveDoFator('atendimento', 'prioritario')]: 1350 } },
        { atendimento: 'prioritario' },
      ).mensalCentavos,
    ).toBe(40_500)
  })

  it('prioritário a R$ 80,00 cobra R$ 80 a mais', () => {
    expect(
      precoCom(
        {
          acrescimosFixos: {
            [chaveDoFator('atendimento', 'prioritario')]: 8_000,
          },
        },
        { atendimento: 'prioritario' },
      ).mensalCentavos,
    ).toBe(38_000)
  })

  it('digital continua neutro dos dois jeitos: 0% e R$ 0,00', () => {
    expect(
      precoCom({ fatores: { [chaveDoFator('atendimento', 'digital')]: 1000 } })
        .mensalCentavos,
    ).toBe(SUBTOTAL)

    expect(
      precoCom({ acrescimosFixos: { [chaveDoFator('atendimento', 'digital')]: 0 } })
        .mensalCentavos,
    ).toBe(SUBTOTAL)
  })

  it('o valor fixo entra no lugar do multiplicador, e o que vem depois incide sobre ele', () => {
    /*
      A ordem é a das dimensões: ramo, atendimento, rotina. Somar R$ 20 no
      atendimento e depois multiplicar por 1,25 na rotina dá (300 + 20) × 1,25.
      Se o acréscimo fixo fosse aplicado no fim, daria 300 × 1,25 + 20 = 395.
    */
    const resultado = precoCom(
      {
        acrescimosFixos: { [chaveDoFator('atendimento', 'hibrido')]: 2_000 },
        fatores: { [chaveDoFator('rotina', 'vincis')]: 1250 },
      },
      { atendimento: 'hibrido', rotina: 'vincis' },
    )

    expect(resultado.mensalCentavos).toBe(40_000)
    expect(resultado.fatores.map((f) => f.dimensao)).toEqual([
      'atividade',
      'atendimento',
      'rotina',
    ])
  })

  it('trocar % por R$ move a prévia sem salvar nada', async () => {
    const gravado = valoresCom({
      precosBase: { simples: SUBTOTAL },
      fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 },
    })

    const rascunho = rascunhoDosValores(gravado)
    expect(rascunho.fatores[chaveDoFator('atendimento', 'hibrido')]).toEqual({
      tipo: 'percentual',
      percentual: '12',
      fixoReais: '0',
    })

    const emReais = {
      ...rascunho,
      fatores: {
        ...rascunho.fatores,
        [chaveDoFator('atendimento', 'hibrido')]: {
          tipo: 'fixo' as const,
          percentual: '12',
          fixoReais: '20',
        },
      },
    }

    const previa = (r: typeof rascunho) =>
      calcularPreco(
        tabelaDoProfissional(estrutura, valoresDoRascunho(r, gravado), {
          primeiroNome: 'João',
        }),
        SERVICO_DO_PROFISSIONAL,
        { ...MINIMO, atendimento: 'hibrido' },
      ).mensalCentavos

    expect(previa(rascunho)).toBe(33_600)
    expect(previa(emReais)).toBe(32_000)

    // Voltar o seletor devolve o percentual intacto: ele nunca saiu do rascunho.
    expect(previa({ ...emReais, fatores: rascunho.fatores })).toBe(33_600)

    // E nada disso encostou no banco.
    const [linha] = await db
      .select({ chave: precificacaoProfissionalValores.chave })
      .from(precificacaoProfissionalValores)
      .where(
        eq(precificacaoProfissionalValores.tipo, 'acrescimo_fixo'),
      )
      .limit(1)
    expect(linha).toBeUndefined()
  })

  it('salvar o rascunho grava a escolha e não move a página pública', async () => {
    const valores = valoresCom({
      precosBase: { simples: SUBTOTAL },
      fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 },
    })

    entrarComo(cenario.tokens.profissionalSozinho)
    expect((await publicarPrecos(entradaDe(valores))).sucesso).toBe(true)

    const emReais = {
      ...valores,
      acrescimosFixos: { [chaveDoFator('atendimento', 'hibrido')]: 2_000 },
    }
    expect((await salvarRascunhoDePrecos(entradaDe(emReais))).sucesso).toBe(true)
    sairDaSessao()

    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, {
        ...MINIMO,
        atendimento: 'hibrido',
      }).mensalCentavos,
    ).toBe(33_600)

    const configuracao = await obterConfiguracaoDoProfissional(
      cenario.ids.profissionalSozinho,
    )
    expect(configuracao!.rascunho.acrescimosFixos).toEqual({
      [chaveDoFator('atendimento', 'hibrido')]: 2_000,
    })
    expect(configuracao!.publicadoValores!.acrescimosFixos).toEqual({})
  })

  it('publicar leva a escolha para a página pública, exatamente como na prévia', async () => {
    const emReais = valoresCom({
      precosBase: { simples: SUBTOTAL },
      fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 },
      acrescimosFixos: { [chaveDoFator('atendimento', 'hibrido')]: 2_000 },
    })

    entrarComo(cenario.tokens.profissionalSozinho)
    expect((await publicarPrecos(entradaDe(emReais))).sucesso).toBe(true)
    sairDaSessao()

    const respostas = { ...MINIMO, atendimento: 'hibrido' }
    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.profissionalSozinho,
    )

    // A prévia do painel monta a tabela pelo mesmo caminho; o preço tem de ser
    // o mesmo número, e não um número parecido.
    const naPrevia = calcularPreco(
      tabelaDoProfissional(estrutura, emReais, {
        primeiroNome: publica!.primeiroNome,
      }),
      SERVICO_DO_PROFISSIONAL,
      respostas,
    ).mensalCentavos

    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, respostas)
        .mensalCentavos,
    ).toBe(32_000)
    expect(naPrevia).toBe(32_000)
  })

  it('configuração gravada antes desta escolha continua cobrando o percentual', async () => {
    const antiga = valoresCom({
      precosBase: { simples: SUBTOTAL },
      fatores: { [chaveDoFator('atendimento', 'hibrido')]: 1120 },
    })

    /*
      As linhas exatamente como a versão anterior as gravava: preço-base, faixa
      e fator, e nenhuma linha de `acrescimo_fixo` — que era tudo o que existia.
      Nenhuma migração de dado tocou nelas.
    */
    await db
      .delete(precificacaoProfissionalValores)
      .where(eq(precificacaoProfissionalValores.profissionalId, cenario.ids.estranho))
    await db.insert(precificacaoProfissionalValores).values(
      linhasDosValores({ ...antiga, acrescimosFixos: {} }).map((linha) => ({
        profissionalId: cenario.ids.estranho,
        estado: 'publicado' as const,
        tipo: linha.tipo,
        chave: linha.chave,
        valor: linha.valor,
        updatedAt: new Date(),
      })),
    )
    await db
      .update(precificacaoProfissional)
      .set({ publicado: true, publicadoEm: new Date() })
      .where(eq(precificacaoProfissional.profissionalId, cenario.ids.estranho))

    const publica = await obterPrecificacaoPublicaDoProfissional(
      cenario.ids.estranho,
    )
    expect(publica).not.toBeNull()
    expect(
      calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, {
        ...MINIMO,
        atendimento: 'hibrido',
      }).mensalCentavos,
    ).toBe(33_600)
  })

  it('a escolha de um profissional não alcança a do outro', async () => {
    const respostas = { ...MINIMO, atendimento: 'hibrido' }
    const precoDe = async (id: string) => {
      const publica = await obterPrecificacaoPublicaDoProfissional(id)
      return calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, respostas)
        .mensalCentavos
    }

    // Um cobra R$ 20 fixos; o outro, os mesmos 12% de sempre. Mesmo perfil de
    // empresa, mesma pergunta, dois preços — e cada um é o do dono.
    expect(await precoDe(cenario.ids.profissionalSozinho)).toBe(32_000)
    expect(await precoDe(cenario.ids.estranho)).toBe(33_600)
  })

  it('não deixa cobrar em reais onde a grade não permite', async () => {
    entrarComo(cenario.tokens.profissionalSozinho)
    const resultado = await salvarRascunhoDePrecos(
      entradaDe(
        valoresCom({
          precosBase: { simples: SUBTOTAL },
          acrescimosFixos: { [chaveDoFator('atividade', 'comercio')]: 5_000 },
        }),
      ),
    )
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('mudou de formato')
  })
})

/* --------------------------------------------------- a Vincis, no fim de tudo */

describe('a precificação da Vincis, depois de tudo', () => {
  it('continua exatamente como estava antes', async () => {
    expect(retratoDaVincis(await obterTabelaPrecificacao())).toBe(retratoAntes)
  })

  it('nenhuma resposta da Vincis cobra valor fixo — todas multiplicam', async () => {
    const tabela = await obterTabelaPrecificacao()

    const opcoes = tabela.dimensoes.flatMap((d) => d.opcoes)
    expect(opcoes.every((o) => (o.acrescimoCentavos ?? null) === null)).toBe(true)

    // E o motor confirma na conta: todo fator aplicado em /precos é um
    // multiplicador, como sempre foi.
    for (const preco of calcularPrecos(tabela, COMPLETO)) {
      for (const fator of preco.fatores) {
        expect(fator.acrescimoCentavos).toBeNull()
        expect(fator.multiplicadorMilesimos).not.toBeNull()
      }
    }
  })
})
