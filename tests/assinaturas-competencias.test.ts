import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturas,
  eventosAuditoria,
  parceiroComissoes,
} from '@/db/schema'
import { contratarPlanoVincis } from '@/features/assinaturas/actions/contratar-plano'
import {
  inicioDaCompetencia,
  periodoDaCompetencia,
} from '@/features/assinaturas/lib/calendario'
import {
  cancelarCompetenciasNaoPrestadas,
  gerarCompetenciasPrevistas,
  materializarCompetenciaMensal,
} from '@/features/assinaturas/lib/competencias'
import { distribuirCentavos } from '@/features/assinaturas/lib/valores'
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

/*
  Aritmética pura: não precisa de banco.

  É aqui que mora o dinheiro — nenhum centavo criado ou perdido na repartição —
  e o calendário — nenhum dia que escorrega de um mês para o outro.
*/
describe('repartição de centavos', () => {
  it('semestre exato: seis partes iguais', () => {
    const partes = distribuirCentavos(240_000, 6)
    expect(partes).toEqual(Array(6).fill(40_000))
  })

  it('resto vai para as primeiras partes, um centavo cada', () => {
    expect(distribuirCentavos(100_000, 3)).toEqual([33_334, 33_333, 33_333])
    expect(distribuirCentavos(7, 3)).toEqual([3, 2, 2])
  })

  it('a soma é sempre exatamente o total', () => {
    for (const [total, partes] of [
      [100_000, 3],
      [438_000, 12],
      [1, 12],
      [999_999, 7],
    ]) {
      const soma = distribuirCentavos(total, partes).reduce((a, b) => a + b, 0)
      expect(soma).toBe(total)
    }
  })

  it('é determinística', () => {
    expect(distribuirCentavos(100_000, 3)).toEqual(distribuirCentavos(100_000, 3))
  })

  it('recusa entrada que não é centavo inteiro', () => {
    expect(() => distribuirCentavos(10.5, 2)).toThrow()
    expect(() => distribuirCentavos(-1, 2)).toThrow()
    expect(() => distribuirCentavos(100, 0)).toThrow()
  })
})

describe('calendário das competências', () => {
  it('31 de janeiro: fevereiro encurta, março volta ao 31', () => {
    expect(
      [1, 2, 3, 4].map((n) => inicioDaCompetencia('2026-01-31', n)),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('ano bissexto: 31 de janeiro de 2028 cai em 29 de fevereiro', () => {
    expect(inicioDaCompetencia('2028-01-31', 2)).toBe('2028-02-29')
    // Começou num 29/02: no ano seguinte o mês não tem 29.
    expect(inicioDaCompetencia('2024-02-29', 13)).toBe('2025-02-28')
  })

  it('30 de abril chega a fevereiro como 28', () => {
    expect(inicioDaCompetencia('2026-04-30', 2)).toBe('2026-05-30')
    expect(inicioDaCompetencia('2026-04-30', 11)).toBe('2027-02-28')
  })

  it('vira o ano sem perder o dia', () => {
    expect(inicioDaCompetencia('2026-11-15', 3)).toBe('2027-01-15')
    expect(inicioDaCompetencia('2026-11-15', 14)).toBe('2027-12-15')
  })

  it('meses contíguos, sem buraco nem sobreposição', () => {
    const periodos = Array.from({ length: 12 }, (_, i) =>
      periodoDaCompetencia('2026-01-31', i + 1),
    )
    expect(periodos[0]).toEqual({ inicio: '2026-01-31', fim: '2026-02-27' })
    for (let i = 1; i < periodos.length; i++) {
      const fimAnterior = new Date(`${periodos[i - 1].fim}T00:00:00Z`)
      const inicio = new Date(`${periodos[i].inicio}T00:00:00Z`)
      expect(inicio.getTime() - fimAnterior.getTime()).toBe(86_400_000)
    }
    // Doze meses cobrem exatamente um ano.
    expect(periodos[11].fim).toBe('2027-01-30')
  })

  it('recusa número e data inválidos', () => {
    expect(() => inicioDaCompetencia('2026-01-31', 0)).toThrow()
    expect(() => inicioDaCompetencia('2026-02-31', 1)).toThrow()
  })
})

const SUFIXO = '@assinaturas.competencias.teste'
type Chave = 'cliente' | 'outroCliente'

let contas: Record<Chave, { id: string; token: string }>
let tabela: TabelaPrecificacao
let respostas: RespostasPrecificacao

function prazos(plano: string) {
  const periodos = calcularPreco(tabela, plano, respostas).periodos
  const porMeses = (meses: number) =>
    periodos.find((p) => p.meses === meses) as PrecoPeriodo
  return { mensal: porMeses(1), semestral: porMeses(6), anual: porMeses(12) }
}

async function contratar(plano: string, periodo: PrecoPeriodo, chave: Chave = 'cliente') {
  entrarComo(contas[chave].token)
  const resultado = await contratarPlanoVincis({
    planoCodigo: plano,
    periodoCodigo: periodo.periodo,
    respostas,
  })
  sairDaSessao()
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return resultado.dados!.assinaturaId
}

async function competenciasDe(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
}

/** Um contrato gravado direto, para os casos que a vitrine não produz. */
async function contratoDireto(dados: Partial<typeof assinaturas.$inferInsert>) {
  const [linha] = await db
    .insert(assinaturas)
    .values({
      clienteUsuarioId: contas.outroCliente.id,
      planoCodigo: 'padrao',
      planoNome: 'Contabilidade Padrão',
      periodoCodigo: 'seis_meses',
      periodicidade: 'semestral',
      meses: 6,
      valorMensalCheioCentavos: 26_000,
      descontoMilesimos: 80,
      valorMensalCentavos: 24_000,
      valorTotalCentavos: 144_000,
      oferta: {},
      chaveIntencao: `direto-${crypto.randomUUID()}`,
      ...dados,
    })
    .returning({ id: assinaturas.id })
  return linha.id
}

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    { cliente: { perfil: 'cliente' }, outroCliente: { perfil: 'cliente' } },
    '119482',
  )) as Record<Chave, { id: string; token: string }>
  tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
})

afterAll(async () => {
  sairDaSessao()
  const ids = Object.values(contas).map((conta) => conta.id)
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

/**
 * O contrato nasce com os meses que ele cobre — previstos.
 *
 * Nenhum nasce pago, em andamento ou datado: a vigência depende de pagamento
 * real, que ainda não existe. O que estes testes protegem é a forma — quantos
 * meses, com que valor, sem duplicar — e a ausência de qualquer efeito
 * financeiro.
 */
describe('competências nascem com a contratação', () => {
  it('semestral: seis meses, que somam o total contratado', async () => {
    const id = await contratar('padrao', prazos('padrao').semestral)
    const [contrato] = await db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.id, id))
    const meses = await competenciasDe(id)

    expect(meses.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5, 6])
    expect(meses.reduce((t, m) => t + m.valorBaseCentavos, 0)).toBe(
      contrato.valorTotalCentavos,
    )
    expect(meses.every((m) => m.valorBaseCentavos === contrato.valorMensalCentavos)).toBe(true)
  })

  it('anual: doze meses', async () => {
    const id = await contratar('padrao', prazos('padrao').anual)
    const meses = await competenciasDe(id)
    expect(meses).toHaveLength(12)
    expect(meses.at(-1)?.numero).toBe(12)
  })

  it('mensal: só o primeiro mês — sem horizonte inventado', async () => {
    const id = await contratar('padrao', prazos('padrao').mensal)
    const meses = await competenciasDe(id)
    expect(meses).toHaveLength(1)
    expect(meses[0].numero).toBe(1)
  })

  it('nenhum mês nasce pago, em andamento, cumprido ou datado', async () => {
    const ids = Object.values(contas).map((conta) => conta.id)
    const todas = await db
      .select({
        status: assinaturaCompetencias.status,
        inicio: assinaturaCompetencias.periodoInicio,
        cumprida: assinaturaCompetencias.cumpridaEm,
      })
      .from(assinaturaCompetencias)
      .innerJoin(assinaturas, eq(assinaturas.id, assinaturaCompetencias.assinaturaId))
      .where(inArray(assinaturas.clienteUsuarioId, ids))

    expect(todas.length).toBeGreaterThan(0)
    expect(todas.every((c) => c.status === 'prevista')).toBe(true)
    expect(todas.every((c) => c.inicio === null && c.cumprida === null)).toBe(true)
  })

  it('a tabela não tem como dizer que um mês foi pago', async () => {
    // Pagamento terá entidade própria; aqui não pode haver uma segunda verdade.
    const colunas = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_name = 'assinatura_competencias'
        and (column_name like '%pag%' or column_name like '%comiss%')`)
    expect([...colunas]).toHaveLength(0)
  })

  it('nenhuma comissão de parceiro nasce', async () => {
    const ids = Object.values(contas).map((conta) => conta.id)
    const comissoes = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(inArray(parceiroComissoes.clienteUsuarioId, ids))
    expect(comissoes).toHaveLength(0)
  })

  it('a auditoria da contratação conta os meses previstos', async () => {
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
    expect((evento.metadados as { competenciasPrevistas: number }).competenciasPrevistas).toBeGreaterThan(0)
  })
})

describe('gerar de novo não duplica', () => {
  it('reprocessar não cria mês nenhum', async () => {
    const id = await contratoDireto({})
    expect(await gerarCompetenciasPrevistas(db, id)).toBe(6)
    expect(await gerarCompetenciasPrevistas(db, id)).toBe(0)
    expect(await competenciasDe(id)).toHaveLength(6)
  })

  it('três gerações simultâneas criam os seis meses uma vez', async () => {
    const id = await contratoDireto({})
    const criadas = await Promise.all([
      gerarCompetenciasPrevistas(db, id),
      gerarCompetenciasPrevistas(db, id),
      gerarCompetenciasPrevistas(db, id),
    ])
    expect(criadas.reduce((a, b) => a + b, 0)).toBe(6)
    expect(await competenciasDe(id)).toHaveLength(6)
  })

  it('contrato cancelado não ganha mês', async () => {
    const id = await contratoDireto({
      status: 'cancelada',
      canceladoEm: new Date(),
    })
    expect(await gerarCompetenciasPrevistas(db, id)).toBe(0)
  })
})

describe('datas, quando houver vigência', () => {
  it('o mês começa no dia em São Paulo e segue o calendário', async () => {
    // Fixture do estado futuro: vigência existente. Nada aqui representa
    // pagamento — só exercita a datação que o motor financeiro vai usar.
    const id = await contratoDireto({
      status: 'ativa',
      // 31/01 às 12h em São Paulo; em UTC ainda é dia 31.
      vigenciaInicio: new Date('2026-01-31T15:00:00Z'),
    })
    await gerarCompetenciasPrevistas(db, id)
    const meses = await competenciasDe(id)

    expect(meses[0].periodoInicio).toBe('2026-01-31')
    expect(meses[0].periodoFim).toBe('2026-02-27')
    expect(meses[1].periodoInicio).toBe('2026-02-28')
    expect(meses[2].periodoInicio).toBe('2026-03-31')
    expect(meses.every((m) => m.status === 'prevista')).toBe(true)
  })
})

describe('mensal: um mês de cada vez', () => {
  it('materializa o mês seguinte, com o preço vigente', async () => {
    const id = await contratoDireto({
      periodoCodigo: 'mensal',
      periodicidade: 'mensal',
      meses: 1,
      descontoMilesimos: 0,
      valorMensalCentavos: 26_000,
      valorTotalCentavos: 26_000,
    })
    await gerarCompetenciasPrevistas(db, id)

    // Reajuste: o mês 2 nasce com o preço novo; o mês 1 não muda.
    expect(
      await materializarCompetenciaMensal(db, {
        assinaturaId: id,
        numero: 2,
        valorBaseCentavos: 28_000,
      }),
    ).toBe('criada')
    const meses = await competenciasDe(id)
    expect(meses.map((m) => m.valorBaseCentavos)).toEqual([26_000, 28_000])
  })

  it('pedir o mesmo mês de novo não duplica', async () => {
    const [contrato] = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(
        and(
          eq(assinaturas.clienteUsuarioId, contas.outroCliente.id),
          eq(assinaturas.periodicidade, 'mensal'),
        ),
      )
      .limit(1)
    expect(
      await materializarCompetenciaMensal(db, { assinaturaId: contrato.id, numero: 2 }),
    ).toBe('ja_existia')
    expect(await competenciasDe(contrato.id)).toHaveLength(2)
  })

  it('não salta mês nem cria horizonte', async () => {
    const [contrato] = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(
        and(
          eq(assinaturas.clienteUsuarioId, contas.outroCliente.id),
          eq(assinaturas.periodicidade, 'mensal'),
        ),
      )
      .limit(1)
    expect(
      await materializarCompetenciaMensal(db, { assinaturaId: contrato.id, numero: 120 }),
    ).toBe('fora_de_ordem')
    expect(await competenciasDe(contrato.id)).toHaveLength(2)
  })

  it('prazo fechado não usa a materialização mensal', async () => {
    const id = await contratoDireto({})
    expect(
      await materializarCompetenciaMensal(db, { assinaturaId: id, numero: 7 }),
    ).toBe('nao_elegivel')
  })
})

describe('cancelamento estrutural', () => {
  it('encerra só os meses não prestados, e não apaga nada', async () => {
    const id = await contratoDireto({})
    await gerarCompetenciasPrevistas(db, id)

    // Meses 1 e 2 prestados — estado que o motor futuro produzirá.
    await db
      .update(assinaturaCompetencias)
      .set({ status: 'cumprida', cumpridaEm: new Date() })
      .where(
        and(
          eq(assinaturaCompetencias.assinaturaId, id),
          inArray(assinaturaCompetencias.numero, [1, 2]),
        ),
      )

    expect(await cancelarCompetenciasNaoPrestadas(db, id)).toBe(4)

    const meses = await competenciasDe(id)
    expect(meses).toHaveLength(6)
    expect(meses.slice(0, 2).every((m) => m.status === 'cumprida')).toBe(true)
    expect(meses.slice(2).every((m) => m.status === 'cancelada' && m.canceladaEm)).toBe(true)
  })

  it('cancelar de novo não mexe em nada', async () => {
    const id = await contratoDireto({})
    await gerarCompetenciasPrevistas(db, id)
    expect(await cancelarCompetenciasNaoPrestadas(db, id)).toBe(6)
    expect(await cancelarCompetenciasNaoPrestadas(db, id)).toBe(0)
  })
})

describe('as travas do banco', () => {
  it('recusa o mesmo mês duas vezes', async () => {
    const id = await contratoDireto({})
    await gerarCompetenciasPrevistas(db, id)
    await expect(
      db.insert(assinaturaCompetencias).values({
        assinaturaId: id,
        numero: 1,
        valorBaseCentavos: 1,
      }),
    ).rejects.toThrow()
  })

  it('recusa cancelada sem data e cumprida sem data', async () => {
    const id = await contratoDireto({})
    await expect(
      db.insert(assinaturaCompetencias).values({
        assinaturaId: id,
        numero: 1,
        valorBaseCentavos: 1,
        status: 'cancelada',
      }),
    ).rejects.toThrow()
    await expect(
      db.insert(assinaturaCompetencias).values({
        assinaturaId: id,
        numero: 1,
        valorBaseCentavos: 1,
        status: 'cumprida',
      }),
    ).rejects.toThrow()
  })

  it('recusa período que termina antes de começar', async () => {
    const id = await contratoDireto({})
    await expect(
      db.insert(assinaturaCompetencias).values({
        assinaturaId: id,
        numero: 1,
        valorBaseCentavos: 1,
        periodoInicio: '2026-03-10',
        periodoFim: '2026-03-01',
      }),
    ).rejects.toThrow()
  })

  it('recusa status que não existe', async () => {
    const id = await contratoDireto({})
    await expect(
      db.insert(assinaturaCompetencias).values({
        assinaturaId: id,
        numero: 1,
        valorBaseCentavos: 1,
        status: 'paga',
      }),
    ).rejects.toThrow()
  })
})
