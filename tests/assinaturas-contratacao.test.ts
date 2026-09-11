import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturas,
  consultoriaPagamentos,
  eventosAuditoria,
  oportunidadePagamentos,
  oportunidades,
  parceiroComissoes,
} from '@/db/schema'
import { contratarPlanoVincis } from '@/features/assinaturas/actions/contratar-plano'
import type { OfertaContratada } from '@/features/assinaturas/lib/oferta'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaDaVitrine } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  PrecoPeriodo,
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@assinaturas.contratacao.teste'
type Chave = 'cliente' | 'outroCliente' | 'prestador'

let contas: Record<Chave, { id: string; token: string }>
let tabela: TabelaPrecificacao
let respostas: RespostasPrecificacao
let prazos: { mensal: PrecoPeriodo; semestral: PrecoPeriodo; anual: PrecoPeriodo }

/** Os prazos de um plano, pelo motor e pela tabela que a migração semeou. */
function prazosDe(plano: string) {
  const periodos = calcularPreco(tabela, plano, respostas).periodos
  const porMeses = (meses: number) => periodos.find((p) => p.meses === meses)!
  return { mensal: porMeses(1), semestral: porMeses(6), anual: porMeses(12) }
}

async function doCliente(usuarioId: string) {
  return db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.clienteUsuarioId, usuarioId))
}

async function contratarComo(
  chave: Chave | null,
  entrada: Record<string, unknown>,
) {
  if (chave) entrarComo(contas[chave].token)
  else sairDaSessao()
  const resultado = await contratarPlanoVincis(entrada)
  sairDaSessao()
  return resultado
}

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      cliente: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
      prestador: { perfil: 'profissional', prestador: 'profissional' },
    },
    '119494',
  )) as Record<Chave, { id: string; token: string }>

  tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  prazos = prazosDe('padrao')
})

afterAll(async () => {
  sairDaSessao()
  const ids = Object.values(contas).map((conta) => conta.id)
  // As competências apontam para a assinatura sem cascata: saem primeiro.
  const doCenario = await db
    .select({ id: assinaturas.id })
    .from(assinaturas)
    .where(inArray(assinaturas.clienteUsuarioId, ids))
  if (doCenario.length) {
    await db.delete(assinaturaCompetencias).where(
      inArray(
        assinaturaCompetencias.assinaturaId,
        doCenario.map((linha) => linha.id),
      ),
    )
  }
  await db.delete(assinaturas).where(inArray(assinaturas.clienteUsuarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await limparContas(SUFIXO)
})

describe('a tabela semeada oferece os três prazos', () => {
  it('mensal, 6 e 12 meses existem no plano padrão', () => {
    expect(prazos.mensal).toBeDefined()
    expect(prazos.semestral).toBeDefined()
    expect(prazos.anual).toBeDefined()
  })
})

/**
 * Contratar a Vincis: nasce o contrato, não o pagamento.
 *
 * O que estes testes protegem é a fronteira entre aceite e dinheiro. A linha
 * nasce `aguardando_pagamento`, com a oferta congelada pelo motor, e nada — nem
 * o clique repetido, nem um preço mandado pelo navegador — produz contrato
 * ativo, mês pago, comissão ou segunda linha.
 */
describe('contratação de um plano da Vincis', () => {
  it('sem sessão, manda entrar e não cria contrato', async () => {
    const resultado = await contratarComo(null, {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.mensal.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(true)
    expect(await doCliente(contas.cliente.id)).toHaveLength(0)
  })

  it('mensal: aguardando pagamento, sem profissional, oferta congelada', async () => {
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.mensal.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(true)

    const [linha] = await doCliente(contas.cliente.id)
    expect(linha.status).toBe('aguardando_pagamento')
    expect(linha.prestadorId).toBeNull()
    expect(linha.periodicidade).toBe('mensal')
    expect(linha.meses).toBe(1)
    expect(linha.valorMensalCentavos).toBe(prazos.mensal.mensalCentavos)
    expect(linha.valorTotalCentavos).toBe(prazos.mensal.totalPeriodoCentavos)
    // Vigência só começa com dinheiro.
    expect(linha.vigenciaInicio).toBeNull()
    expect(linha.vigenciaFim).toBeNull()

    const oferta = linha.oferta as OfertaContratada
    expect(oferta.plano.codigo).toBe('padrao')
    expect(oferta.periodo.meses).toBe(1)
    expect(oferta.respostas).toEqual(respostas)
    expect(oferta.itens.length).toBeGreaterThan(0)
    expect(oferta.composicao.linhas.length).toBeGreaterThan(0)
  })

  it('semestral: 6 meses, desconto do prazo, total igual a mensal × 6', async () => {
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.semestral.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(true)

    const linha = (await doCliente(contas.cliente.id)).find(
      (a) => a.meses === 6,
    )!
    expect(linha.periodicidade).toBe('semestral')
    expect(linha.descontoMilesimos).toBe(prazos.semestral.descontoMilesimos)
    expect(linha.valorMensalCentavos).toBeLessThanOrEqual(
      linha.valorMensalCheioCentavos,
    )
    // Período comercial não é quantidade de pagamentos: é a duração.
    expect(linha.valorTotalCentavos).toBe(linha.valorMensalCentavos * 6)
  })

  it('anual: 12 meses', async () => {
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.anual.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(true)

    const linha = (await doCliente(contas.cliente.id)).find(
      (a) => a.meses === 12,
    )!
    expect(linha.periodicidade).toBe('anual')
    expect(linha.valorTotalCentavos).toBe(linha.valorMensalCentavos * 12)
  })

  it('preço mandado pelo navegador é ignorado', async () => {
    const juridico = prazosDe('juridico')
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'juridico',
      periodoCodigo: juridico.mensal.periodo,
      respostas,
      // Campos que não existem no contrato da action: não viram dinheiro.
      valorTotalCentavos: 1,
      valorMensalCentavos: 1,
    })
    expect(resultado.sucesso).toBe(true)

    const linha = (await doCliente(contas.cliente.id)).find(
      (a) => a.planoCodigo === 'juridico',
    )!
    expect(linha.valorMensalCentavos).toBe(juridico.mensal.mensalCentavos)
    expect(linha.valorTotalCentavos).toBe(juridico.mensal.totalPeriodoCentavos)
    expect(linha.valorTotalCentavos).not.toBe(1)
  })

  it('clicar de novo devolve a mesma contratação', async () => {
    const antes = await doCliente(contas.cliente.id)
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.mensal.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(true)
    expect(resultado.sucesso && resultado.dados?.repetida).toBe(true)
    expect(await doCliente(contas.cliente.id)).toHaveLength(antes.length)
  })

  it('dois cliques simultâneos criam um contrato só', async () => {
    const consultiva = prazosDe('consultiva')
    entrarComo(contas.outroCliente.token)
    const entrada = {
      planoCodigo: 'consultiva',
      periodoCodigo: consultiva.mensal.periodo,
      respostas,
    }
    const [a, b] = await Promise.all([
      contratarPlanoVincis(entrada),
      contratarPlanoVincis(entrada),
    ])
    sairDaSessao()

    expect(a.sucesso && b.sucesso).toBe(true)
    const linhas = await doCliente(contas.outroCliente.id)
    expect(linhas).toHaveLength(1)
  })

  it('prazo que a tabela não oferece é recusado', async () => {
    const antes = await doCliente(contas.cliente.id)
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: 'dezoito_meses',
      respostas,
    })
    expect(resultado.sucesso).toBe(false)
    expect(await doCliente(contas.cliente.id)).toHaveLength(antes.length)
  })

  it('plano que não existe é recusado', async () => {
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'plano_inventado',
      periodoCodigo: prazos.mensal.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('resposta que o motor não conhece é recusada', async () => {
    const resultado = await contratarComo('cliente', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.mensal.periodo,
      respostas: { ...respostas, regime: 'regime_inventado' },
    })
    expect(resultado.sucesso).toBe(false)
  })

  it('profissional não contrata plano da Vincis', async () => {
    const resultado = await contratarComo('prestador', {
      planoCodigo: 'padrao',
      periodoCodigo: prazos.mensal.periodo,
      respostas,
    })
    expect(resultado.sucesso).toBe(false)
    expect(await doCliente(contas.prestador.id)).toHaveLength(0)
  })
})

describe('o que a contratação não faz', () => {
  it('nenhuma assinatura fica ativa sem pagamento real', async () => {
    const ids = Object.values(contas).map((conta) => conta.id)
    const ativas = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(
        and(
          inArray(assinaturas.clienteUsuarioId, ids),
          eq(assinaturas.status, 'ativa'),
        ),
      )
    expect(ativas).toHaveLength(0)
  })

  it('nenhuma comissão de parceiro nasce', async () => {
    const ids = Object.values(contas).map((conta) => conta.id)
    const comissoes = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(inArray(parceiroComissoes.clienteUsuarioId, ids))
    expect(comissoes).toHaveLength(0)
  })

  it('não cria oportunidade: não é o fluxo direto com profissional', async () => {
    const ids = Object.values(contas).map((conta) => conta.id)
    const criadas = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(inArray(oportunidades.clienteUsuarioId, ids))
    expect(criadas).toHaveLength(0)
  })

  it('não registra pagamento nenhum', async () => {
    /*
      Contratar não é pagar. Os dois registros de pagamento que a plataforma
      tem — ambos simulados — não recebem linha por causa de uma contratação.
      (Antes este teste afirmava que a tabela de ciclos ainda não existia; a
      fatia seguinte a criou, e o que continua verdade é isto.)
    */
    const ids = Object.values(contas).map((conta) => conta.id)
    const deOportunidade = await db
      .select({ id: oportunidadePagamentos.id })
      .from(oportunidadePagamentos)
      .where(inArray(oportunidadePagamentos.clienteUsuarioId, ids))
    const deConsultoria = await db
      .select({ id: consultoriaPagamentos.id })
      .from(consultoriaPagamentos)
      .where(inArray(consultoriaPagamentos.clienteUsuarioId, ids))
    expect(deOportunidade).toHaveLength(0)
    expect(deConsultoria).toHaveLength(0)
  })

  it('a contratação fica auditada como contrato, não como pagamento', async () => {
    const [evento] = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.autorId, contas.cliente.id),
          eq(eventosAuditoria.acao, 'assinatura_vincis_contratada'),
        ),
      )
      .limit(1)
    const dados = evento.metadados as { status: string; meses: number }
    expect(dados.status).toBe('aguardando_pagamento')
    expect(dados.meses).toBeGreaterThan(0)
  })
})

describe('as travas do banco', () => {
  const base = () => ({
    clienteUsuarioId: contas.cliente.id,
    planoCodigo: 'padrao',
    planoNome: 'Contabilidade Padrão',
    periodoCodigo: 'mensal',
    periodicidade: 'mensal',
    meses: 1,
    valorMensalCheioCentavos: 10000,
    descontoMilesimos: 0,
    valorMensalCentavos: 10000,
    valorTotalCentavos: 10000,
    oferta: {},
    chaveIntencao: `trava-${crypto.randomUUID()}`,
  })

  it('recusa total que não bate com mensal × meses', async () => {
    await expect(
      db.insert(assinaturas).values({
        ...base(),
        meses: 6,
        periodicidade: 'semestral',
        valorTotalCentavos: 1,
      }),
    ).rejects.toThrow()
  })

  it('recusa status fora do vocabulário', async () => {
    await expect(
      db.insert(assinaturas).values({ ...base(), status: 'paga' }),
    ).rejects.toThrow()
  })

  it('recusa periodicidade desconhecida', async () => {
    await expect(
      db.insert(assinaturas).values({ ...base(), periodicidade: 'trimestral' }),
    ).rejects.toThrow()
  })
})
