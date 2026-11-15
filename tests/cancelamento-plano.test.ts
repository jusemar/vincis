import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Cancelamento do plano recorrente contábil da Vincis.
 *
 * Encerra a relação recorrente: sem novo Pix, cobrança ou mês; vaga do contador
 * liberada; histórico, pagamentos, meses pagos/prestados e conta preservados.
 * Pix confirmado depois do cancelamento não reativa nada. Efí de teste.
 */
const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturaPagamentos,
  assinaturas,
  cobrancasPix,
  eventosAuditoria,
  perfisProfissionais,
  usuarios,
} = await import('@/db/schema')
const { cancelarMeuPlano, cancelarPlanoPelaGestao } = await import('@/features/assinaturas/actions/cancelar-plano')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { listarClientesVincisDoContador, ocupacaoDoContador } = await import(
  '@/features/assinaturas/queries/carteira-do-contador'
)
const { listarPlanosGestao } = await import('@/features/assinaturas/queries/listar-planos-gestao')
const { listarPlanosDoCliente } = await import('@/features/assinaturas/queries/planos-do-cliente')
const { sincronizarCobranca } = await import('@/features/pagamentos/lib/cobrancas')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { resolverAcessoUsuario } = await import('@/features/usuarios/queries/obter-destino-apos-login')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@cancelamento-plano.teste'
type Chave = 'parceiro' | 'outroParceiro' | 'clienteA' | 'clienteB' | 'clienteC' | 'clienteD' | 'gestor' | 'autonomo' | 'advogado'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodos: { mensal: string; semestral: string }

function contratar(cliente: Conta, contador: unknown, codigo: 'padrao' | 'consultiva' = 'padrao', periodo = periodos.mensal) {
  return comSessao(cliente.token, () => contratarPlanoVincis({ planoCodigo: codigo, periodoCodigo: periodo, respostas, contador }))
}

async function plano(cliente: Conta, codigo: 'padrao' | 'consultiva' = 'padrao', periodo = periodos.mensal) {
  const r = await contratar(cliente, { escolha: 'cliente', contadorId: contas.parceiro.id }, codigo, periodo)
  if (!r.sucesso) throw new Error(r.mensagem)
  return r.dados!.assinaturaId
}

async function txidDe(cobrancaId: string) {
  return (await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, cobrancaId)))[0].txid
}

async function emitir(cliente: Conta, assinaturaId: string) {
  const emitida = await comSessao(cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId }))
  if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
  return emitida.cobranca
}

async function pagar(cliente: Conta, assinaturaId: string) {
  const cobranca = await emitir(cliente, assinaturaId)
  efiDeTeste.pagar(await txidDe(cobranca.id))
  return comSessao(cliente.token, () => acompanharPagamentoDoPlano({ assinaturaId }))
}

const cancelarComoCliente = (cliente: Conta, assinaturaId: string) =>
  comSessao(cliente.token, () => cancelarMeuPlano({ assinaturaId }))
const cancelarComoGestor = (assinaturaId: string, motivo = 'Encerramento da empresa') =>
  comSessao(contas.gestor.token, () => cancelarPlanoPelaGestao({ assinaturaId, motivo }))

async function linha(id: string) {
  return (await db.select().from(assinaturas).where(eq(assinaturas.id, id)))[0]
}
async function meses(id: string) {
  return db
    .select({ numero: assinaturaCompetencias.numero, status: assinaturaCompetencias.status })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, id))
    .orderBy(assinaturaCompetencias.numero)
}
async function pagamentos(id: string) {
  return db.select({ id: assinaturaPagamentos.id, status: assinaturaPagamentos.status }).from(assinaturaPagamentos).where(eq(assinaturaPagamentos.assinaturaId, id))
}
async function cancelamentosAuditados(id: string) {
  return db
    .select({ metadados: eventosAuditoria.metadados, autorId: eventosAuditoria.autorId })
    .from(eventosAuditoria)
    .where(and(eq(eventosAuditoria.acao, 'assinatura_cancelada'), eq(eventosAuditoria.registroAfetado, id)))
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      parceiro: { perfil: 'profissional', prestador: 'profissional' },
      outroParceiro: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      clienteA: { perfil: 'cliente' },
      clienteB: { perfil: 'cliente' },
      clienteC: { perfil: 'cliente' },
      clienteD: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119511',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'contabilidade', modeloContratacao: 'vincis' })
    .where(inArray(perfisProfissionais.usuarioId, [contas.parceiro.id, contas.outroParceiro.id]))
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

describe('plano ativo', () => {
  let planoA: string

  it('A, H, I e J. cliente cancela o plano ativo: mês prestado intacto, pagamento intacto, conta ativa', async () => {
    planoA = await plano(contas.clienteA)
    expect((await pagar(contas.clienteA, planoA)).situacao).toBe('pago')
    expect(await cumprirCompetencia({ competenciaId: (await db.select({ id: assinaturaCompetencias.id }).from(assinaturaCompetencias).where(and(eq(assinaturaCompetencias.assinaturaId, planoA), eq(assinaturaCompetencias.numero, 1))))[0].id })).toMatchObject({ ok: true })
    const pagamentosAntes = await pagamentos(planoA)

    const r = await cancelarComoCliente(contas.clienteA, planoA)
    expect(r.sucesso).toBe(true)
    const depois = await linha(planoA)
    expect(depois).toMatchObject({ status: 'cancelada', prestadorId: contas.parceiro.id })
    expect(depois.canceladoEm).not.toBeNull()
    expect((await meses(planoA)).find((m) => m.numero === 1)?.status).toBe('cumprida')
    expect(await pagamentos(planoA)).toEqual(pagamentosAntes)
    expect(pagamentosAntes.every((p) => p.status === 'confirmado')).toBe(true)

    const [conta] = await db.select({ status: usuarios.status }).from(usuarios).where(eq(usuarios.id, contas.clienteA.id))
    expect(conta.status).toBe('ativo')
    expect((await resolverAcessoUsuario(contas.clienteA.id))?.destino).toBe('/cliente')

    const [evento] = await cancelamentosAuditados(planoA)
    expect(evento.autorId).toBe(contas.clienteA.id)
    expect(evento.metadados).toMatchObject({ origem: 'cliente', estadoAnterior: 'ativa', estadoPosterior: 'cancelada' })
  })

  it('depois de cancelado: sem novo Pix, contador sem o vínculo ativo, cliente vê "cancelado"', async () => {
    const pix = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoPlano({ assinaturaId: planoA }))
    expect(pix.situacao).toBe('recusado')
    expect((await listarClientesVincisDoContador(contas.parceiro.id)).map((c) => c.assinaturaId)).not.toContain(planoA)
    const doCliente = await listarPlanosDoCliente(contas.clienteA.id)
    expect(doCliente.find((p) => p.id === planoA)).toMatchObject({ status: 'cancelada' })
    expect(doCliente.find((p) => p.id === planoA)?.canceladoEm).not.toBeNull()
  })

  it('B. Gestor cancela plano ativo com motivo; aparece em "Cancelados" com quem e quando', async () => {
    const id = await plano(contas.clienteB)
    expect((await pagar(contas.clienteB, id)).situacao).toBe('pago')
    expect((await comSessao(contas.gestor.token, () => cancelarPlanoPelaGestao({ assinaturaId: id, motivo: '' }))).sucesso).toBe(false)
    expect((await cancelarComoGestor(id, 'Inadimplência')).sucesso).toBe(true)
    expect(await linha(id)).toMatchObject({ status: 'cancelada', cancelamentoMotivo: 'Inadimplência' })
    const cancelados = await listarPlanosGestao({ filtro: 'cancelados' })
    expect(cancelados.planos.find((p) => p.id === id)?.cancelamento).toMatchObject({ motivo: 'Inadimplência', origem: 'gestor', por: 'Teste gestor' })
    expect((await listarPlanosGestao({ filtro: 'todos' })).planos.map((p) => p.id)).not.toContain(id)
    // Só o Gestor cancela pela Gestão; cliente não cancela plano de outro cliente.
    const outro = await plano(contas.clienteC)
    expect((await comSessao(contas.clienteA.token, () => cancelarPlanoPelaGestao({ assinaturaId: outro, motivo: 'x x x' }))).sucesso).toBe(false)
    expect((await cancelarComoCliente(contas.clienteA, outro)).sucesso).toBe(false)
    expect((await linha(outro)).status).toBe('aguardando_pagamento')
    await cancelarComoGestor(outro)
  })

  it('semestral pago adiantado: mês em andamento preservado e concluível; futuros encerrados; dinheiro intacto (sem estorno)', async () => {
    const id = await plano(contas.clienteD, 'consultiva', periodos.semestral)
    expect((await pagar(contas.clienteD, id)).situacao).toBe('pago')
    const alocacoesAntes = await db.execute<{ total: number }>(sql`select count(*)::int as total from assinatura_pagamento_alocacoes where assinatura_id = ${id}`)
    expect((await cancelarComoCliente(contas.clienteD, id)).sucesso).toBe(true)
    const depois = await meses(id)
    expect(depois[0].status).toBe('em_andamento')
    expect(depois.slice(1).every((m) => m.status === 'cancelada')).toBe(true)
    expect((await pagamentos(id)).every((p) => p.status === 'confirmado')).toBe(true)
    const alocacoesDepois = await db.execute<{ total: number }>(sql`select count(*)::int as total from assinatura_pagamento_alocacoes where assinatura_id = ${id}`)
    expect(alocacoesDepois[0].total).toBe(alocacoesAntes[0].total)
    // O mês já pago e em andamento ainda pode ser concluído; os futuros, não.
    const [primeiro, segundo] = await db
      .select({ id: assinaturaCompetencias.id })
      .from(assinaturaCompetencias)
      .where(eq(assinaturaCompetencias.assinaturaId, id))
      .orderBy(assinaturaCompetencias.numero)
    expect(await cumprirCompetencia({ competenciaId: primeiro.id })).toMatchObject({ ok: true })
    expect(await cumprirCompetencia({ competenciaId: segundo.id })).toEqual({ ok: false, motivo: 'competencia_cancelada' })
  })
})

describe('plano aguardando o primeiro pagamento', () => {
  it('C, D. cancelar com Pix válido; Pix pago depois não reativa (vira conflito para a equipe)', async () => {
    const id = await plano(contas.clienteC, 'consultiva')
    const cobranca = await emitir(contas.clienteC, id)
    expect((await ocupacaoDoContador(contas.parceiro.id)).reservados).toBeGreaterThan(0)
    const ocupadosAntes = (await ocupacaoDoContador(contas.parceiro.id)).ocupados

    expect((await cancelarComoCliente(contas.clienteC, id)).sucesso).toBe(true)
    expect((await meses(id)).every((m) => m.status === 'cancelada')).toBe(true)
    expect((await ocupacaoDoContador(contas.parceiro.id)).ocupados).toBe(ocupadosAntes - 1)
    expect((await comSessao(contas.clienteC.token, () => iniciarPagamentoDoPlano({ assinaturaId: id }))).situacao).toBe('recusado')

    // O cliente paga o Pix antigo mesmo assim; a confirmação chega depois.
    efiDeTeste.pagar(await txidDe(cobranca.id))
    const sincronizada = await sincronizarCobranca(cobranca.id, { forcar: true })
    expect(sincronizada).toMatchObject({ status: 'paga', efeito: 'conflito' })
    expect((await linha(id)).status).toBe('cancelada')
    expect(await pagamentos(id)).toHaveLength(0)
    expect((await ocupacaoDoContador(contas.parceiro.id)).ocupados).toBe(ocupadosAntes - 1)
  })
})

describe('capacidade', () => {
  it('E, F e G. dois planos do mesmo cliente: cancelar um mantém 1 vaga; cancelar o último libera', async () => {
    const base = (await ocupacaoDoContador(contas.outroParceiro.id)).ocupados
    const escolha = { escolha: 'cliente', contadorId: contas.outroParceiro.id }
    const r1 = await contratar(contas.clienteD, escolha, 'padrao', periodos.mensal)
    const r2 = await contratar(contas.clienteD, escolha, 'consultiva', periodos.mensal)
    if (!r1.sucesso || !r2.sucesso) throw new Error('contratação falhou')
    expect((await ocupacaoDoContador(contas.outroParceiro.id)).ocupados).toBe(base + 1)

    expect((await cancelarComoCliente(contas.clienteD, r1.dados!.assinaturaId)).sucesso).toBe(true)
    expect((await ocupacaoDoContador(contas.outroParceiro.id)).ocupados).toBe(base + 1)

    expect((await cancelarComoGestor(r2.dados!.assinaturaId)).sucesso).toBe(true)
    expect((await ocupacaoDoContador(contas.outroParceiro.id)).ocupados).toBe(base)
  })
})

describe('repetição, concorrência e nova contratação', () => {
  it('L. cancelar de novo (e em paralelo) é idempotente: um registro, um efeito', async () => {
    const id = await plano(contas.clienteB, 'consultiva')
    const resultados = await Promise.all([
      cancelarComoCliente(contas.clienteB, id),
      cancelarComoCliente(contas.clienteB, id),
      cancelarComoGestor(id),
    ])
    expect(resultados.every((r) => r.sucesso)).toBe(true)
    expect(resultados.filter((r) => r.sucesso && !r.dados.jaEstavaCancelado)).toHaveLength(1)
    expect(await cancelamentosAuditados(id)).toHaveLength(1)
    const repetido = await cancelarComoCliente(contas.clienteB, id)
    expect(repetido).toMatchObject({ sucesso: true, dados: { jaEstavaCancelado: true } })
    expect(await cancelamentosAuditados(id)).toHaveLength(1)
  })

  it('K. depois de cancelar, o cliente contrata de novo: nova assinatura, novo ciclo', async () => {
    const antigos = (await listarPlanosDoCliente(contas.clienteA.id)).map((p) => p.id)
    const r = await contratar(contas.clienteA, { escolha: 'vincis' })
    expect(r.sucesso).toBe(true)
    if (!r.sucesso) return
    expect(antigos).not.toContain(r.dados!.assinaturaId)
    expect((await linha(r.dados!.assinaturaId)).status).toBe('aguardando_pagamento')
    expect((await linha(antigos[0])).status).toBe('cancelada')
  })
})

describe('fora deste fluxo', () => {
  it('M e N. Perfil Pro/armazenamento (advogado e Autônomo) não são cancelados por aqui', async () => {
    const valores = {
      planoNome: 'Adicional',
      periodoCodigo: 'mensal',
      periodicidade: 'mensal',
      meses: 1,
      valorMensalCheioCentavos: 990,
      descontoMilesimos: 0,
      valorMensalCentavos: 990,
      valorTotalCentavos: 990,
      oferta: {},
    }
    const [doAdvogado] = await db
      .insert(assinaturas)
      .values({ ...valores, clienteUsuarioId: contas.advogado.id, planoCodigo: 'perfil_pro', chaveIntencao: `t-${crypto.randomUUID()}` })
      .returning({ id: assinaturas.id })
    const [doAutonomo] = await db
      .insert(assinaturas)
      .values({ ...valores, clienteUsuarioId: contas.autonomo.id, planoCodigo: 'autonomo_armazenamento', chaveIntencao: `t-${crypto.randomUUID()}` })
      .returning({ id: assinaturas.id })
    expect((await cancelarComoCliente(contas.advogado, doAdvogado.id)).sucesso).toBe(false)
    expect((await cancelarComoCliente(contas.autonomo, doAutonomo.id)).sucesso).toBe(false)
    expect((await cancelarComoGestor(doAdvogado.id)).sucesso).toBe(false)
    expect((await linha(doAdvogado.id)).status).toBe('aguardando_pagamento')
    expect((await linha(doAutonomo.id)).status).toBe('aguardando_pagamento')
  })
})
