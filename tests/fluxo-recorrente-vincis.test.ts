import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * O fluxo recorrente que já existia — contrato → competências → pagamento →
 * `ativa` → mês prestado (`cumprirCompetencia`) → cobertura — continua de pé
 * para o contador parceiro `modelo = vincis`, depois das separações recentes
 * (contador × advogado, Vincis × Autônomo, recorrente × avulso, capacidade).
 *
 * Usa as mesmas funções de domínio de antes (as que os scripts de homologação
 * chamam). Efí de teste; o resto é real.
 */
const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const { assinaturaCompetencias, assinaturas, cobrancasPix, eventosAuditoria, perfisProfissionais } = await import(
  '@/db/schema'
)
const { alocarContadorResponsavel } = await import('@/features/assinaturas/actions/alocar-contador')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { PROVEDOR_HOMOLOGACAO } = await import('@/features/assinaturas/constants/pagamento')
const { coberturaDasCompetencias, confirmarPagamentoDeAssinatura } = await import('@/features/assinaturas/lib/pagamentos')
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { listarClientesVincisDoContador, ocupacaoDoContador } = await import(
  '@/features/assinaturas/queries/carteira-do-contador'
)
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { listarContadoresParceiros, usuarioContadorParceiroVincis } = await import(
  '@/features/profissionais/queries/contadores-parceiros'
)
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@fluxo-recorrente.teste'
type Chave = 'parceiro' | 'autonomo' | 'advogado' | 'cliente' | 'outroCliente' | 'gestor'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodos: { mensal: string; semestral: string }
let plano: string

function contratar(cliente: Conta, contador: unknown, codigo: 'padrao' | 'consultiva' = 'padrao', periodo = periodos.mensal) {
  return comSessao(cliente.token, () =>
    contratarPlanoVincis({ planoCodigo: codigo, periodoCodigo: periodo, respostas, contador }),
  )
}

async function txidDe(cobrancaId: string) {
  const [linha] = await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, cobrancaId))
  return linha.txid
}

async function mes(assinaturaId: string, numero: number) {
  const [linha] = await db
    .select()
    .from(assinaturaCompetencias)
    .where(and(eq(assinaturaCompetencias.assinaturaId, assinaturaId), eq(assinaturaCompetencias.numero, numero)))
  return linha
}

async function linhaDoPlano(id: string) {
  return (await db.select().from(assinaturas).where(eq(assinaturas.id, id)))[0]
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      parceiro: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119501',
  )
  await db.update(perfisProfissionais).set({ tipoProfissional: 'contabilidade', modeloContratacao: 'vincis' }).where(eq(perfisProfissionais.usuarioId, contas.parceiro.id))
  await db.update(perfisProfissionais).set({ tipoProfissional: 'contabilidade', modeloContratacao: 'autonomo' }).where(eq(perfisProfissionais.usuarioId, contas.autonomo.id))
  await db.update(perfisProfissionais).set({ tipoProfissional: 'advocacia' }).where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
  const tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  const { calcularPreco } = await import('@/features/precificacao/lib/motor')
  const calculo = calcularPreco(tabela, 'padrao', respostas)
  periodos = {
    mensal: calculo.periodos.find((p) => p.meses === 1)!.periodo,
    semestral: calculo.periodos.find((p) => p.meses === 6)!.periodo,
  }
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  sairDaSessao()
  const ids = Object.values(contas).map((c) => c.id)
  const lista = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.usuarioId, ids), inArray(eventosAuditoria.autorId, ids)))
  await db.execute(sql`delete from assinatura_contador_alocacoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamento_alocacoes where pagamento_id in (select p.id from assinatura_pagamentos p join assinaturas a on a.id = p.assinatura_id where a.cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamentos where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_competencias where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiro_atribuicoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.execute(sql`delete from assinaturas where cliente_usuario_id in (${lista})`)
  await db.execute(sql`delete from notificacoes where autor_id in (${lista}) or destinatario_id in (${lista})`)
  await limparContas(SUFIXO)
})

describe('A. plano recorrente Vincis aguardando o primeiro pagamento', () => {
  it('nasce com contrato, competências previstas e contador alocado; reserva 1 vaga', async () => {
    const r = await contratar(contas.cliente, { escolha: 'cliente', contadorId: contas.parceiro.id })
    if (!r.sucesso) throw new Error(r.mensagem)
    plano = r.dados!.assinaturaId
    const linha = await linhaDoPlano(plano)
    expect(linha).toMatchObject({ status: 'aguardando_pagamento', prestadorId: contas.parceiro.id, escolhaContador: 'cliente' })
    expect((await mes(plano, 1)).status).toBe('prevista')
    expect(await ocupacaoDoContador(contas.parceiro.id)).toEqual({ ativos: 0, reservados: 1, ocupados: 1 })
  })

  it('aparece em "Meus clientes Vincis" como aguardando pagamento e a prestação é recusada', async () => {
    const item = (await listarClientesVincisDoContador(contas.parceiro.id)).find((c) => c.assinaturaId === plano)
    expect(item?.situacao).toBe('aguardando_pagamento')
    expect(await cumprirCompetencia({ competenciaId: (await mes(plano, 1)).id })).toEqual({
      ok: false,
      motivo: 'pagamento_nao_confirmado',
    })
    expect((await mes(plano, 1)).status).toBe('prevista')
  })
})

describe('B. Efí confirma o pagamento', () => {
  it('plano fica ativo, mesmo contador, vaga não duplica e o mês pago fica coberto', async () => {
    const emitida = await comSessao(contas.cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId: plano }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    expect((await comSessao(contas.cliente.token, () => acompanharPagamentoDoPlano({ assinaturaId: plano }))).situacao).toBe('pago')

    const linha = await linhaDoPlano(plano)
    expect(linha.status).toBe('ativa')
    expect(linha.vigenciaInicio).not.toBeNull()
    expect(linha.prestadorId).toBe(contas.parceiro.id)
    expect(await ocupacaoDoContador(contas.parceiro.id)).toEqual({ ativos: 1, reservados: 0, ocupados: 1 })
    const cobertura = await coberturaDasCompetencias(db, plano)
    expect(cobertura.get((await mes(plano, 1)).id) ?? 0).toBeGreaterThan(0)
  })
})

describe('C. depois do pagamento, o fluxo antigo segue', () => {
  it('contador vê o cliente liberado e cumpre o mês pela regra antiga (idempotente)', async () => {
    const item = (await listarClientesVincisDoContador(contas.parceiro.id)).find((c) => c.assinaturaId === plano)
    expect(item?.situacao).toBe('liberada')
    const primeiro = await mes(plano, 1)
    expect(await cumprirCompetencia({ competenciaId: primeiro.id })).toMatchObject({ ok: true, jaEstavaCumprida: false })
    expect(await cumprirCompetencia({ competenciaId: primeiro.id })).toMatchObject({ ok: true, jaEstavaCumprida: true })
    expect((await mes(plano, 1)).status).toBe('cumprida')
  })

  it('o caminho de homologação (pagamento manual) continua ativando contrato e cumprindo meses', async () => {
    const r = await contratar(contas.outroCliente, { escolha: 'vincis' }, 'padrao', periodos.semestral)
    if (!r.sucesso) throw new Error(r.mensagem)
    const id = r.dados!.assinaturaId
    const [aloc] = await Promise.all([
      comSessao(contas.gestor.token, () => alocarContadorResponsavel({ assinaturaId: id, contadorId: contas.parceiro.id })),
    ])
    expect(aloc.sucesso).toBe(true)
    const anterior = process.env.VINCIS_AMBIENTE
    process.env.VINCIS_AMBIENTE = 'homologacao'
    try {
      const total = (await linhaDoPlano(id)).valorTotalCentavos
      const pago = await confirmarPagamentoDeAssinatura({
        assinaturaId: id,
        provedor: PROVEDOR_HOMOLOGACAO,
        chaveIdempotencia: `fluxo-recorrente-${id}`,
        valorCentavos: total,
      })
      expect(pago.ok).toBe(true)
      // Repetir a mesma chave não duplica.
      const repetido = await confirmarPagamentoDeAssinatura({
        assinaturaId: id,
        provedor: PROVEDOR_HOMOLOGACAO,
        chaveIdempotencia: `fluxo-recorrente-${id}`,
        valorCentavos: total,
      })
      expect(repetido.ok).toBe(true)
    } finally {
      process.env.VINCIS_AMBIENTE = anterior
    }
    expect((await linhaDoPlano(id)).status).toBe('ativa')
    expect(await cumprirCompetencia({ competenciaId: (await mes(id, 1)).id })).toMatchObject({ ok: true })
    const pagamentos = await db.execute<{ total: number }>(sql`select count(*)::int as total from assinatura_pagamentos where assinatura_id = ${id}`)
    expect(Number(pagamentos[0].total)).toBe(1)
  })
})

describe('D. dois planos do mesmo cliente com o mesmo contador', () => {
  it('ocupam uma vaga só e os dois aparecem na carteira do contador', async () => {
    const antes = await ocupacaoDoContador(contas.parceiro.id)
    const r = await contratar(contas.cliente, { escolha: 'cliente', contadorId: contas.parceiro.id }, 'consultiva')
    if (!r.sucesso) throw new Error(r.mensagem)
    expect(await ocupacaoDoContador(contas.parceiro.id)).toEqual(antes)
    const doCliente = (await listarClientesVincisDoContador(contas.parceiro.id)).filter((c) => c.cliente.startsWith('Teste cliente'))
    expect(doCliente.map((c) => c.assinaturaId).sort()).toEqual([plano, r.dados!.assinaturaId].sort())
    // O vínculo operacional do primeiro plano segue intacto.
    expect((await linhaDoPlano(plano)).status).toBe('ativa')
  })

  it('no limite, o segundo plano do mesmo cliente ainda entra (não ocupa vaga nova)', async () => {
    const { ocupados } = await ocupacaoDoContador(contas.parceiro.id)
    await db.update(perfisProfissionais).set({ capacidadeClientesRecorrentes: ocupados }).where(eq(perfisProfissionais.usuarioId, contas.parceiro.id))
    const r = await contratar(contas.cliente, { escolha: 'cliente', contadorId: contas.parceiro.id }, 'padrao', periodos.semestral)
    expect(r.sucesso).toBe(true)
    await db.update(perfisProfissionais).set({ capacidadeClientesRecorrentes: null }).where(eq(perfisProfissionais.usuarioId, contas.parceiro.id))
  })
})

describe('E e F. Autônomo e advogado fora do fluxo recorrente Vincis', () => {
  it('Autônomo não é escolhível nem alocável e não recebe a área', async () => {
    expect((await contratar(contas.outroCliente, { escolha: 'cliente', contadorId: contas.autonomo.id })).sucesso).toBe(false)
    expect((await listarContadoresParceiros()).map((c) => c.id)).not.toContain(contas.autonomo.id)
    expect(await usuarioContadorParceiroVincis(contas.autonomo.id)).toBe(false)
    const [pendente] = await db.select({ id: assinaturas.id }).from(assinaturas).where(and(eq(assinaturas.clienteUsuarioId, contas.cliente.id), eq(assinaturas.planoCodigo, 'consultiva')))
    const r = await comSessao(contas.gestor.token, () => alocarContadorResponsavel({ assinaturaId: pendente.id, contadorId: contas.autonomo.id }))
    expect(r.sucesso).toBe(false)
  })

  it('advogado também não entra no plano contábil da Vincis', async () => {
    expect((await contratar(contas.outroCliente, { escolha: 'cliente', contadorId: contas.advogado.id })).sucesso).toBe(false)
    expect((await listarContadoresParceiros()).map((c) => c.id)).not.toContain(contas.advogado.id)
    expect(await usuarioContadorParceiroVincis(contas.advogado.id)).toBe(false)
  })
})
