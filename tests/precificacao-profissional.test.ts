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
  valoresDeReferencia,
} from '@/features/precificacao-profissional/lib/grade'
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
  }>,
): ValoresDoProfissional {
  const base = valoresDeReferencia(estrutura)
  return {
    precosBase: { ...base.precosBase, ...ajustes.precosBase },
    faixas: { ...base.faixas, ...ajustes.faixas },
    fatores: { ...base.fatores, ...ajustes.fatores },
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

/* --------------------------------------------------- a Vincis, no fim de tudo */

describe('a precificação da Vincis, depois de tudo', () => {
  it('continua exatamente como estava antes', async () => {
    expect(retratoDaVincis(await obterTabelaPrecificacao())).toBe(retratoAntes)
  })
})
