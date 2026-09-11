import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  consultoriaPagamentos,
  eventosAuditoria,
  oportunidadePagamentos,
  oportunidades,
  parceiroComissoes,
  parceiroSaques,
} from '@/db/schema'
import { contratarPlanoVincis } from '@/features/assinaturas/actions/contratar-plano'
import { PROVEDOR_HOMOLOGACAO } from '@/features/assinaturas/constants/pagamento'
import { ambientePermiteConfirmacaoManual } from '@/features/assinaturas/lib/ambiente'
import {
  cancelarCompetenciasNaoPrestadas,
  gerarCompetenciasPrevistas,
} from '@/features/assinaturas/lib/competencias'
import {
  coberturaDasCompetencias,
  confirmarPagamentoDeAssinatura,
  type PagamentoConfirmado,
} from '@/features/assinaturas/lib/pagamentos'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaDaVitrine } from '@/features/precificacao/queries/obter-tabela-precificacao'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@assinaturas.pagamentos.teste'
type Chave = 'clienteA' | 'clienteB'
let contas: Record<Chave, { id: string; token: string }>

const AMBIENTE_ORIGINAL = {
  VINCIS_AMBIENTE: process.env.VINCIS_AMBIENTE,
  VERCEL_ENV: process.env.VERCEL_ENV,
}

const CONTRATOS = {
  semestral: {
    periodoCodigo: 'seis_meses',
    periodicidade: 'semestral',
    meses: 6,
    descontoMilesimos: 80,
    valorMensalCentavos: 24_000,
    valorTotalCentavos: 144_000,
  },
  anual: {
    periodoCodigo: 'doze_meses',
    periodicidade: 'anual',
    meses: 12,
    descontoMilesimos: 150,
    valorMensalCentavos: 36_500,
    valorTotalCentavos: 438_000,
  },
  mensal: {
    periodoCodigo: 'mensal',
    periodicidade: 'mensal',
    meses: 1,
    descontoMilesimos: 0,
    valorMensalCentavos: 40_000,
    valorTotalCentavos: 40_000,
  },
} as const

/** Um contrato como a contratação deixa: aguardando, com as competências. */
async function contrato(
  tipo: keyof typeof CONTRATOS,
  { cliente = 'clienteA' as Chave, status = 'aguardando_pagamento' } = {},
) {
  const [linha] = await db
    .insert(assinaturas)
    .values({
      clienteUsuarioId: contas[cliente].id,
      planoCodigo: 'padrao',
      planoNome: 'Contabilidade Padrão',
      valorMensalCheioCentavos: 43_000,
      oferta: {},
      chaveIntencao: `pagamentos-${crypto.randomUUID()}`,
      ...CONTRATOS[tipo],
    })
    .returning({ id: assinaturas.id })
  await gerarCompetenciasPrevistas(db, linha.id)
  if (status !== 'aguardando_pagamento') {
    await db
      .update(assinaturas)
      .set({ status, canceladoEm: status === 'cancelada' ? new Date() : null })
      .where(eq(assinaturas.id, linha.id))
  }
  return linha.id
}

function confirmar(assinaturaId: string, extra: Partial<PagamentoConfirmado> = {}) {
  return confirmarPagamentoDeAssinatura({
    assinaturaId,
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: `chave-${crypto.randomUUID()}`,
    valorCentavos: 0,
    ...extra,
  })
}

async function competenciasDe(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
}

async function pagamentosDe(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaPagamentos)
    .where(eq(assinaturaPagamentos.assinaturaId, assinaturaId))
}

async function alocacoesDe(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaPagamentoAlocacoes)
    .where(eq(assinaturaPagamentoAlocacoes.assinaturaId, assinaturaId))
}

async function contrato1(assinaturaId: string) {
  const [linha] = await db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
  return linha
}

/** O que um pagamento de assinatura nunca pode mexer. */
async function contagens() {
  const [[op], [cp], [pc], [ps], [o]] = await Promise.all([
    db.select({ n: count() }).from(oportunidadePagamentos),
    db.select({ n: count() }).from(consultoriaPagamentos),
    db.select({ n: count() }).from(parceiroComissoes),
    db.select({ n: count() }).from(parceiroSaques),
    db.select({ n: count() }).from(oportunidades),
  ])
  return {
    oportunidadePagamentos: op.n,
    consultoriaPagamentos: cp.n,
    parceiroComissoes: pc.n,
    parceiroSaques: ps.n,
    oportunidades: o.n,
  }
}

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    { clienteA: { perfil: 'cliente' }, clienteB: { perfil: 'cliente' } },
    '119483',
  )) as Record<Chave, { id: string; token: string }>
})

beforeEach(() => {
  process.env.VINCIS_AMBIENTE = 'homologacao'
  delete process.env.VERCEL_ENV
})

afterAll(async () => {
  sairDaSessao()
  process.env.VINCIS_AMBIENTE = AMBIENTE_ORIGINAL.VINCIS_AMBIENTE
  if (AMBIENTE_ORIGINAL.VINCIS_AMBIENTE === undefined) delete process.env.VINCIS_AMBIENTE
  if (AMBIENTE_ORIGINAL.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = AMBIENTE_ORIGINAL.VERCEL_ENV

  const ids = Object.values(contas).map((conta) => conta.id)
  const doCenario = (
    await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(inArray(assinaturas.clienteUsuarioId, ids))
  ).map((linha) => linha.id)
  if (doCenario.length) {
    await db
      .delete(assinaturaPagamentoAlocacoes)
      .where(inArray(assinaturaPagamentoAlocacoes.assinaturaId, doCenario))
    await db
      .delete(assinaturaPagamentos)
      .where(inArray(assinaturaPagamentos.assinaturaId, doCenario))
    await db
      .delete(assinaturaCompetencias)
      .where(inArray(assinaturaCompetencias.assinaturaId, doCenario))
  }
  await db.delete(assinaturas).where(inArray(assinaturas.clienteUsuarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await limparContas(SUFIXO)
})

describe('a confirmação manual só existe em homologação', () => {
  it('sem ambiente declarado, recusa e não grava nada', async () => {
    const id = await contrato('semestral')
    delete process.env.VINCIS_AMBIENTE
    expect(await confirmar(id, { valorCentavos: 144_000 })).toEqual({
      ok: false,
      motivo: 'ambiente_nao_permitido',
    })
    expect(await pagamentosDe(id)).toHaveLength(0)
    expect((await contrato1(id)).status).toBe('aguardando_pagamento')
  })

  it('deploy de produção recusa mesmo com a variável de homologação', async () => {
    const id = await contrato('semestral')
    process.env.VERCEL_ENV = 'production'
    expect(await confirmar(id, { valorCentavos: 144_000 })).toMatchObject({
      ok: false,
      motivo: 'ambiente_nao_permitido',
    })
    expect(ambientePermiteConfirmacaoManual({ VINCIS_AMBIENTE: 'producao' } as NodeJS.ProcessEnv)).toBe(false)
    expect(await pagamentosDe(id)).toHaveLength(0)
  })

  it('nenhuma tela, rota ou Server Action alcança a confirmação', () => {
    const raiz = path.resolve(process.cwd(), 'src')
    const arquivos: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome)
        if (statSync(caminho).isDirectory()) varrer(caminho)
        else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho)
      }
    }
    varrer(raiz)

    const modulo = path.join(raiz, 'features/assinaturas/lib/pagamentos.ts')
    expect(readFileSync(modulo, 'utf8')).not.toMatch(/^\s*['"]use server['"]/m)

    const quemImporta = arquivos.filter(
      (arquivo) =>
        arquivo !== modulo &&
        /assinaturas\/lib\/pagamentos|confirmarPagamentoDeAssinatura/.test(
          readFileSync(arquivo, 'utf8'),
        ),
    )
    expect(quemImporta.map((a) => path.relative(raiz, a))).toEqual([])
  })

  it('o módulo não lê pagamento simulado', () => {
    const fonte = readFileSync(
      path.resolve(process.cwd(), 'src/features/assinaturas/lib/pagamentos.ts'),
      'utf8',
    )
    expect(fonte).not.toMatch(/oportunidadePagamentos|consultoriaPagamentos|features\/pagamentos/)
  })
})

describe('semestral pago adiantado', () => {
  let id: string
  let resultado: Awaited<ReturnType<typeof confirmar>>
  const confirmadoEm = new Date('2026-01-31T15:00:00Z') // 31/01, meio-dia em SP

  beforeAll(async () => {
    process.env.VINCIS_AMBIENTE = 'homologacao'
    id = await contrato('semestral')
    resultado = await confirmar(id, {
      valorCentavos: 144_000,
      chaveIdempotencia: `semestral-${id}`,
      confirmadoEm,
    })
  })

  it('cria um pagamento confirmado com o valor do contrato', async () => {
    expect(resultado).toMatchObject({ ok: true, repetido: false, ativou: true })
    const pagamentos = await pagamentosDe(id)
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0]).toMatchObject({
      status: 'confirmado',
      valorCentavos: 144_000,
      moeda: 'BRL',
      provedor: 'homologacao_manual',
    })
    expect(pagamentos[0].confirmadoEm?.toISOString()).toBe(confirmadoEm.toISOString())
  })

  it('cobre exatamente as 6 competências, somando o pagamento', async () => {
    const alocacoes = await alocacoesDe(id)
    expect(alocacoes).toHaveLength(6)
    expect(alocacoes.every((a) => a.valorCentavos === 24_000)).toBe(true)
    expect(alocacoes.reduce((t, a) => t + a.valorCentavos, 0)).toBe(144_000)
    if (resultado.ok) expect(resultado.competencias).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('ativa a assinatura com início na confirmação', async () => {
    const linha = await contrato1(id)
    expect(linha.status).toBe('ativa')
    expect(linha.vigenciaInicio?.toISOString()).toBe(confirmadoEm.toISOString())
  })

  it('data os meses pelo calendário, a partir do dia da confirmação', async () => {
    const meses = await competenciasDe(id)
    expect(meses.map((m) => m.periodoInicio)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
    expect(meses[0].periodoFim).toBe('2026-02-27')
    expect(meses[5].periodoFim).toBe('2026-07-30')
  })

  it('pagar adiantado não presta serviço: nenhum mês cumprido', async () => {
    const meses = await competenciasDe(id)
    expect(meses.filter((m) => m.status === 'cumprida')).toHaveLength(0)
    expect(meses[0].status).toBe('em_andamento')
    expect(meses.slice(1).every((m) => m.status === 'prevista')).toBe(true)
  })

  it('nenhuma comissão nasce', async () => {
    const comissoes = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.clienteUsuarioId, contas.clienteA.id))
    expect(comissoes).toHaveLength(0)
  })

  it('audita pagamento e ativação, sem identificador de gateway', async () => {
    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(
        inArray(eventosAuditoria.acao, [
          'assinatura_pagamento_confirmado',
          'assinatura_ativada',
        ]),
      )
    const deste = eventos.filter(
      (e) =>
        (e.metadados as { assinaturaId?: string })?.assinaturaId === id ||
        e.registroAfetado === id,
    )
    expect(deste.map((e) => e.acao).sort()).toEqual([
      'assinatura_ativada',
      'assinatura_pagamento_confirmado',
    ])
    expect(JSON.stringify(deste.map((e) => e.metadados))).not.toMatch(/chave|idExterno|semestral-/)
  })

  it('reprocessar o mesmo evento devolve o mesmo pagamento, sem efeito', async () => {
    const outra = await confirmar(id, {
      valorCentavos: 144_000,
      chaveIdempotencia: `semestral-${id}`,
    })
    expect(outra).toMatchObject({ ok: true, repetido: true, ativou: false })
    if (outra.ok && resultado.ok) expect(outra.pagamentoId).toBe(resultado.pagamentoId)
    expect(await pagamentosDe(id)).toHaveLength(1)
    expect(await alocacoesDe(id)).toHaveLength(6)
    const [linha] = await pagamentosDe(id)
    expect(linha.confirmadoEm?.toISOString()).toBe(confirmadoEm.toISOString())
  })

  it('um segundo evento para contrato já coberto é recusado', async () => {
    expect(await confirmar(id, { valorCentavos: 144_000 })).toMatchObject({
      ok: false,
      motivo: 'sem_competencia_a_cobrir',
    })
    expect(await pagamentosDe(id)).toHaveLength(1)
  })

  it('cancelar depois preserva o mês em andamento e a cobertura', async () => {
    // Estrutura para o estorno futuro: meses 2–6 deixam de ser prestados,
    // o dinheiro e as alocações continuam como história.
    expect(await cancelarCompetenciasNaoPrestadas(db, id)).toBe(5)
    const meses = await competenciasDe(id)
    expect(meses[0].status).toBe('em_andamento')
    expect(await alocacoesDe(id)).toHaveLength(6)
  })
})

describe('anual e mensal', () => {
  it('anual cobre exatamente 12 competências', async () => {
    const id = await contrato('anual')
    const r = await confirmar(id, { valorCentavos: 438_000 })
    expect(r).toMatchObject({ ok: true, competencias: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })
    const alocacoes = await alocacoesDe(id)
    expect(alocacoes).toHaveLength(12)
    expect(alocacoes.reduce((t, a) => t + a.valorCentavos, 0)).toBe(438_000)
    expect((await competenciasDe(id)).filter((m) => m.status === 'cumprida')).toHaveLength(0)
  })

  it('mensal: o primeiro pagamento cobre o mês 1; o seguinte, o mês 2', async () => {
    const id = await contrato('mensal')
    const primeiro = await confirmar(id, {
      valorCentavos: 40_000,
      confirmadoEm: new Date('2026-04-30T12:00:00Z'),
    })
    expect(primeiro).toMatchObject({ ok: true, ativou: true, competencias: [1] })
    expect(await competenciasDe(id)).toHaveLength(1)

    const renovacao = await confirmar(id, { valorCentavos: 40_000 })
    expect(renovacao).toMatchObject({ ok: true, ativou: false, competencias: [2] })

    const meses = await competenciasDe(id)
    expect(meses.map((m) => [m.numero, m.periodoInicio, m.periodoFim])).toEqual([
      [1, '2026-04-30', '2026-05-29'],
      [2, '2026-05-30', '2026-06-29'],
    ])
    expect(meses[1].status).toBe('prevista')
    const cobertura = await coberturaDasCompetencias(db, id)
    expect(meses.map((m) => cobertura.get(m.id))).toEqual([40_000, 40_000])
  })

  it('valor errado no mensal não materializa mês nenhum', async () => {
    const id = await contrato('mensal')
    await confirmar(id, { valorCentavos: 40_000 })
    expect(await confirmar(id, { valorCentavos: 39_999 })).toMatchObject({
      ok: false,
      motivo: 'valor_divergente',
    })
    expect(await competenciasDe(id)).toHaveLength(1)
    expect(await pagamentosDe(id)).toHaveLength(1)
  })
})

describe('recusas', () => {
  it('valor diferente do devido é recusado sem gravar nada', async () => {
    const id = await contrato('semestral')
    for (const valor of [143_999, 24_000, 288_000]) {
      expect(await confirmar(id, { valorCentavos: valor })).toMatchObject({
        ok: false,
        motivo: 'valor_divergente',
      })
    }
    expect(await pagamentosDe(id)).toHaveLength(0)
    const linha = await contrato1(id)
    expect(linha.status).toBe('aguardando_pagamento')
    expect(linha.vigenciaInicio).toBeNull()
    expect((await competenciasDe(id)).every((m) => m.periodoInicio === null)).toBe(true)
  })

  it('valor inválido, moeda estranha e evento sem identidade', async () => {
    const id = await contrato('semestral')
    expect(await confirmar(id, { valorCentavos: 0 })).toMatchObject({ motivo: 'valor_invalido' })
    expect(await confirmar(id, { valorCentavos: 10.5 })).toMatchObject({ motivo: 'valor_invalido' })
    expect(await confirmar(id, { valorCentavos: 144_000, moeda: 'USD' })).toMatchObject({
      motivo: 'moeda_invalida',
    })
    expect(
      await confirmar(id, { valorCentavos: 144_000, chaveIdempotencia: '  ' }),
    ).toMatchObject({ motivo: 'identificacao_ausente' })
    expect(
      await confirmarPagamentoDeAssinatura({
        assinaturaId: id,
        provedor: 'stripe' as typeof PROVEDOR_HOMOLOGACAO,
        chaveIdempotencia: 'x',
        valorCentavos: 144_000,
      }),
    ).toMatchObject({ motivo: 'provedor_invalido' })
    expect(await pagamentosDe(id)).toHaveLength(0)
  })

  it('assinatura inexistente', async () => {
    expect(
      await confirmar(crypto.randomUUID(), { valorCentavos: 144_000 }),
    ).toMatchObject({ ok: false, motivo: 'assinatura_inexistente' })
  })

  it('assinatura cancelada não é ativada por pagamento posterior', async () => {
    const id = await contrato('semestral', { status: 'cancelada' })
    expect(await confirmar(id, { valorCentavos: 144_000 })).toMatchObject({
      ok: false,
      motivo: 'assinatura_nao_pagavel',
    })
    expect((await contrato1(id)).status).toBe('cancelada')
    expect(await pagamentosDe(id)).toHaveLength(0)
  })

  it('o evento de uma assinatura não serve para outra', async () => {
    const a = await contrato('semestral')
    const b = await contrato('semestral', { cliente: 'clienteB' })
    const chave = `mesma-${a}`
    expect(await confirmar(a, { valorCentavos: 144_000, chaveIdempotencia: chave })).toMatchObject({ ok: true })
    expect(await confirmar(b, { valorCentavos: 144_000, chaveIdempotencia: chave })).toMatchObject({
      ok: false,
      motivo: 'evento_de_outra_assinatura',
    })
    expect(await pagamentosDe(b)).toHaveLength(0)
    expect((await contrato1(b)).status).toBe('aguardando_pagamento')
  })
})

describe('concorrência', () => {
  it('o mesmo evento cinco vezes ao mesmo tempo: um pagamento', async () => {
    const id = await contrato('semestral')
    const chave = `concorrente-${id}`
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        confirmar(id, { valorCentavos: 144_000, chaveIdempotencia: chave }),
      ),
    )
    expect(resultados.every((r) => r.ok)).toBe(true)
    expect(resultados.filter((r) => r.ok && !r.repetido)).toHaveLength(1)
    expect(resultados.filter((r) => r.ok && r.ativou)).toHaveLength(1)
    expect(await pagamentosDe(id)).toHaveLength(1)
    expect(await alocacoesDe(id)).toHaveLength(6)
  })

  it('eventos diferentes ao mesmo tempo no semestral: só um cobre', async () => {
    const id = await contrato('semestral')
    const resultados = await Promise.all(
      Array.from({ length: 4 }, () => confirmar(id, { valorCentavos: 144_000 })),
    )
    expect(resultados.filter((r) => r.ok)).toHaveLength(1)
    expect(resultados.filter((r) => !r.ok && r.motivo === 'sem_competencia_a_cobrir')).toHaveLength(3)
    expect(await alocacoesDe(id)).toHaveLength(6)
  })

  it('duas renovações simultâneas do mensal: dois meses, um de cada', async () => {
    const id = await contrato('mensal')
    await confirmar(id, { valorCentavos: 40_000 })
    const resultados = await Promise.all([
      confirmar(id, { valorCentavos: 40_000 }),
      confirmar(id, { valorCentavos: 40_000 }),
    ])
    expect(resultados.every((r) => r.ok)).toBe(true)
    const meses = await competenciasDe(id)
    expect(meses.map((m) => m.numero)).toEqual([1, 2, 3])
    const alocacoes = await alocacoesDe(id)
    expect(new Set(alocacoes.map((a) => a.competenciaId)).size).toBe(3)
  })
})

describe('pendente vira confirmado', () => {
  it('a cobrança pendente de mesma identidade é a que se confirma', async () => {
    const id = await contrato('semestral')
    const [pendente] = await db
      .insert(assinaturaPagamentos)
      .values({
        assinaturaId: id,
        valorCentavos: 144_000,
        provedor: 'homologacao_manual',
        idExterno: `cobranca-${id}`,
      })
      .returning()
    expect(pendente.status).toBe('pendente')
    // Pendente não cobre nada.
    expect((await coberturaDasCompetencias(db, id)).size).toBe(0)

    const r = await confirmar(id, {
      valorCentavos: 144_000,
      idExterno: `cobranca-${id}`,
      chaveIdempotencia: null,
    })
    expect(r).toMatchObject({ ok: true, pagamentoId: pendente.id, ativou: true })
    const [linha] = await pagamentosDe(id)
    expect(linha.status).toBe('confirmado')
  })

  it('cobrança cancelada não se confirma', async () => {
    const id = await contrato('semestral')
    await db.insert(assinaturaPagamentos).values({
      assinaturaId: id,
      valorCentavos: 144_000,
      provedor: 'homologacao_manual',
      idExterno: `cancelada-${id}`,
      status: 'cancelado',
      canceladoEm: new Date(),
    })
    expect(
      await confirmar(id, { valorCentavos: 144_000, idExterno: `cancelada-${id}` }),
    ).toMatchObject({ ok: false, motivo: 'pagamento_nao_confirmavel' })
    expect((await contrato1(id)).status).toBe('aguardando_pagamento')
  })

  it('estorno descobre os meses sem apagar a história', async () => {
    const id = await contrato('semestral')
    const r = await confirmar(id, { valorCentavos: 144_000 })
    if (!r.ok) throw new Error(r.motivo)
    await db
      .update(assinaturaPagamentos)
      .set({ status: 'estornado', estornadoEm: new Date() })
      .where(eq(assinaturaPagamentos.id, r.pagamentoId))
    expect((await coberturaDasCompetencias(db, id)).size).toBe(0)
    expect(await alocacoesDe(id)).toHaveLength(6)
  })
})

describe('isolamento financeiro', () => {
  it('pagar A não toca B, parceiros, saldo, comissões nem oportunidades', async () => {
    const a = await contrato('semestral')
    const b = await contrato('anual', { cliente: 'clienteB' })
    const antesB = { contrato: await contrato1(b), meses: await competenciasDe(b) }
    const antes = await contagens()

    expect(await confirmar(a, { valorCentavos: 144_000 })).toMatchObject({ ok: true })

    expect(await contagens()).toEqual(antes)
    expect(await contrato1(b)).toEqual(antesB.contrato)
    expect(await competenciasDe(b)).toEqual(antesB.meses)
    expect(await pagamentosDe(b)).toHaveLength(0)
    expect(await alocacoesDe(b)).toHaveLength(0)
  })
})

describe('as travas do banco', () => {
  it('provedor + id externo duplicado é recusado', async () => {
    const id = await contrato('semestral')
    const valores = {
      assinaturaId: id,
      valorCentavos: 1,
      provedor: 'homologacao_manual',
      idExterno: `dup-${id}`,
    }
    await db.insert(assinaturaPagamentos).values(valores)
    await expect(db.insert(assinaturaPagamentos).values(valores)).rejects.toThrow()
  })

  it('a mesma alocação duas vezes é recusada', async () => {
    const id = await contrato('semestral')
    const r = await confirmar(id, { valorCentavos: 144_000 })
    if (!r.ok) throw new Error(r.motivo)
    const [primeira] = await alocacoesDe(id)
    await expect(
      db.insert(assinaturaPagamentoAlocacoes).values({
        pagamentoId: r.pagamentoId,
        competenciaId: primeira.competenciaId,
        assinaturaId: id,
        valorCentavos: 1,
      }),
    ).rejects.toThrow()
  })

  it('pagamento de A não pode cobrir mês de B, nem declarando B', async () => {
    const a = await contrato('semestral')
    const b = await contrato('semestral', { cliente: 'clienteB' })
    const r = await confirmar(a, { valorCentavos: 144_000 })
    if (!r.ok) throw new Error(r.motivo)
    const [mesDeB] = await competenciasDe(b)
    for (const assinaturaId of [a, b]) {
      await expect(
        db.insert(assinaturaPagamentoAlocacoes).values({
          pagamentoId: r.pagamentoId,
          competenciaId: mesDeB.id,
          assinaturaId,
          valorCentavos: 1,
        }),
      ).rejects.toThrow()
    }
  })

  it('recusa estado sem carimbo, provedor desconhecido, moeda e valor', async () => {
    const id = await contrato('semestral')
    const base = {
      assinaturaId: id,
      valorCentavos: 100,
      provedor: 'homologacao_manual',
      chaveIdempotencia: `trava-${crypto.randomUUID()}`,
    }
    await expect(db.insert(assinaturaPagamentos).values({ ...base, status: 'confirmado' })).rejects.toThrow()
    await expect(db.insert(assinaturaPagamentos).values({ ...base, status: 'pago' })).rejects.toThrow()
    await expect(db.insert(assinaturaPagamentos).values({ ...base, provedor: 'stripe' })).rejects.toThrow()
    await expect(db.insert(assinaturaPagamentos).values({ ...base, moeda: 'USD' })).rejects.toThrow()
    await expect(db.insert(assinaturaPagamentos).values({ ...base, valorCentavos: 0 })).rejects.toThrow()
    await expect(
      db.insert(assinaturaPagamentos).values({ ...base, chaveIdempotencia: null }),
    ).rejects.toThrow()
  })
})

describe('a contratação de /precos continua igual', () => {
  it('nasce aguardando pagamento, sem pagamento nem cobertura', async () => {
    const tabela = await obterTabelaDaVitrine()
    const respostas = respostasIniciais(tabela)
    const semestral = calcularPreco(tabela, 'padrao', respostas).periodos.find(
      (p) => p.meses === 6,
    )!
    entrarComo(contas.clienteB.token)
    const r = await contratarPlanoVincis({
      planoCodigo: 'padrao',
      periodoCodigo: semestral.periodo,
      respostas,
    })
    sairDaSessao()
    if (!r.sucesso) throw new Error(r.mensagem)
    const id = r.dados!.assinaturaId
    expect((await contrato1(id)).status).toBe('aguardando_pagamento')
    expect(await competenciasDe(id)).toHaveLength(6)
    expect(await pagamentosDe(id)).toHaveLength(0)

    // E o pagamento confirmado desse contrato usa o total que ele congelou.
    const devido = (await contrato1(id)).valorTotalCentavos
    expect(await confirmar(id, { valorCentavos: devido })).toMatchObject({ ok: true, ativou: true })
    expect(
      (await alocacoesDe(id)).reduce((t, a) => t + a.valorCentavos, 0),
    ).toBe(devido)
  })
})

describe('sem regressão na assinatura de outro cliente', () => {
  it('competências de B seguem sem datas e previstas', async () => {
    const b = await contrato('semestral', { cliente: 'clienteB' })
    const meses = await competenciasDe(b)
    expect(meses.every((m) => m.status === 'prevista' && m.periodoInicio === null)).toBe(true)
    expect(
      await db
        .select()
        .from(assinaturaPagamentos)
        .where(and(eq(assinaturaPagamentos.assinaturaId, b))),
    ).toHaveLength(0)
  })
})
