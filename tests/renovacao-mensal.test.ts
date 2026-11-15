import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Renovação mensal dos planos contábeis da Vincis.
 *
 * O cliente contrata uma vez; cada mês seguinte é uma competência nova da
 * mesma assinatura, disponibilizada 7 dias antes do início do período e paga
 * por um Pix da Efí (de teste) que quita exatamente aquele mês.
 *
 * Relógio controlado (`vi.setSystemTime`, só `Date`): os meses passam sem tocar
 * em data nenhuma do banco local. Todos os planos começam em 10/01/2027
 * (12h em São Paulo): mês 1 = 10/01–09/02, mês 2 = 10/02–09/03 (janela abre
 * 03/02), mês 3 = 10/03–09/04 (janela abre 03/03).
 */
const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  cobrancasPix,
  efiWebhookEventos,
  eventosAuditoria,
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
} = await import('@/db/schema')
const { cancelarMeuPlano } = await import('@/features/assinaturas/actions/cancelar-plano')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { prepararMensalidadesDaAssinatura, prepararMensalidadesDosPlanos } = await import(
  '@/features/assinaturas/lib/mensalidades'
)
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { listarClientesVincisDoContador, ocupacaoDoContador } = await import(
  '@/features/assinaturas/queries/carteira-do-contador'
)
const { listarPlanosDoCliente } = await import('@/features/assinaturas/queries/planos-do-cliente')
const { sincronizarCobranca } = await import('@/features/pagamentos/lib/cobrancas')
const { processarAvisosDePix } = await import('@/features/pagamentos/lib/webhook-efi')
const { lerAvisosDePix } = await import('@/integracoes/efi/webhook')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@renovacao-mensal.teste'
type Chave = 'parceiro' | 'autonomo' | 'advogado' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 's'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodos: { mensal: string; semestral: string }
const planos = {} as Record<'a' | 'b' | 'b2' | 'c' | 'd' | 'e' | 'f' | 's', string>

/** 12h em São Paulo do dia pedido. */
const dia = (data: string) => new Date(`${data}T15:00:00Z`)

/** Avança o relógio — e as sessões de teste, que vencem em 1 hora. */
async function relogio(data: Date) {
  vi.setSystemTime(data)
  await db
    .update(sessoesUsuario)
    .set({ expiraEm: new Date(data.getTime() + 3600_000) })
    .where(inArray(sessoesUsuario.usuarioId, Object.values(contas).map((c) => c.id)))
}

function contratar(cliente: Conta, contador: unknown, codigo: 'padrao' | 'consultiva' = 'padrao', periodo = periodos.mensal) {
  return comSessao(cliente.token, () => contratarPlanoVincis({ planoCodigo: codigo, periodoCodigo: periodo, respostas, contador }))
}

async function plano(cliente: Conta, codigo: 'padrao' | 'consultiva' = 'padrao', periodo = periodos.mensal) {
  const r = await contratar(cliente, { escolha: 'cliente', contadorId: contas.parceiro.id }, codigo, periodo)
  if (!r.sucesso) throw new Error(r.mensagem)
  return r.dados!.assinaturaId
}

const iniciar = (cliente: Conta, assinaturaId: string) =>
  comSessao(cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId }))
const acompanhar = (cliente: Conta, assinaturaId: string) =>
  comSessao(cliente.token, () => acompanharPagamentoDoPlano({ assinaturaId }))

async function cobranca(id: string) {
  return (await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, id)))[0]
}

async function emitir(cliente: Conta, assinaturaId: string) {
  const emitida = await iniciar(cliente, assinaturaId)
  if (emitida.situacao !== 'cobranca') throw new Error(`esperava cobrança, veio ${emitida.situacao}`)
  return emitida.cobranca
}

async function pagar(cliente: Conta, assinaturaId: string) {
  const emitida = await emitir(cliente, assinaturaId)
  efiDeTeste.pagar((await cobranca(emitida.id)).txid)
  return { emitida, resultado: await acompanhar(cliente, assinaturaId) }
}

async function meses(id: string) {
  return db
    .select({
      id: assinaturaCompetencias.id,
      numero: assinaturaCompetencias.numero,
      status: assinaturaCompetencias.status,
      inicio: assinaturaCompetencias.periodoInicio,
      fim: assinaturaCompetencias.periodoFim,
      valor: assinaturaCompetencias.valorBaseCentavos,
    })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, id))
    .orderBy(assinaturaCompetencias.numero)
}
const mes = async (id: string, numero: number) => (await meses(id)).find((m) => m.numero === numero)!

/** Quanto de cada mês está pago (só pagamento confirmado), por número. */
async function pagoPorMes(id: string) {
  const linhas = await db
    .select({ numero: assinaturaCompetencias.numero, valor: assinaturaPagamentoAlocacoes.valorCentavos })
    .from(assinaturaPagamentoAlocacoes)
    .innerJoin(assinaturaPagamentos, eq(assinaturaPagamentos.id, assinaturaPagamentoAlocacoes.pagamentoId))
    .innerJoin(assinaturaCompetencias, eq(assinaturaCompetencias.id, assinaturaPagamentoAlocacoes.competenciaId))
    .where(and(eq(assinaturaPagamentoAlocacoes.assinaturaId, id), eq(assinaturaPagamentos.status, 'confirmado')))
  const mapa = new Map<number, number>()
  for (const l of linhas) mapa.set(l.numero, (mapa.get(l.numero) ?? 0) + l.valor)
  return mapa
}
async function pagamentosDe(id: string) {
  return db.select().from(assinaturaPagamentos).where(eq(assinaturaPagamentos.assinaturaId, id))
}
async function cobrancasDe(id: string) {
  return db
    .select()
    .from(cobrancasPix)
    .where(and(eq(cobrancasPix.finalidade, 'assinatura'), eq(cobrancasPix.referenciaId, id)))
    .orderBy(cobrancasPix.createdAt)
}
const cumprir = async (id: string, numero: number) => cumprirCompetencia({ competenciaId: (await mes(id, numero)).id })
async function planoDoCliente(cliente: Conta, id: string) {
  return (await listarPlanosDoCliente(cliente.id)).find((p) => p.id === id)!
}
async function linha(id: string) {
  return (await db.select().from(assinaturas).where(eq(assinaturas.id, id)))[0]
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(dia('2027-01-10'))
  contas = await criarContas(
    SUFIXO,
    {
      parceiro: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      a: { perfil: 'cliente' },
      b: { perfil: 'cliente' },
      c: { perfil: 'cliente' },
      d: { perfil: 'cliente' },
      e: { perfil: 'cliente' },
      f: { perfil: 'cliente' },
      s: { perfil: 'cliente' },
    },
    '119522',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'contabilidade', modeloContratacao: 'vincis' })
    .where(eq(perfisProfissionais.usuarioId, contas.parceiro.id))
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'contabilidade', modeloContratacao: 'autonomo' })
    .where(eq(perfisProfissionais.usuarioId, contas.autonomo.id))
  await db.update(perfisProfissionais).set({ tipoProfissional: 'advocacia' }).where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
  const tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  const { calcularPreco } = await import('@/features/precificacao/lib/motor')
  const calculo = calcularPreco(tabela, 'padrao', respostas)
  periodos = {
    mensal: calculo.periodos.find((p) => p.meses === 1)!.periodo,
    semestral: calculo.periodos.find((p) => p.meses === 6)!.periodo,
  }

  // Todos contratam e pagam o primeiro período no mesmo dia: 10/01/2027.
  efiDeTeste.limpar()
  for (const chave of ['a', 'c', 'd', 'e', 'f'] as const) {
    planos[chave] = await plano(contas[chave])
    if ((await pagar(contas[chave], planos[chave])).resultado.situacao !== 'pago') throw new Error(`pagar ${chave}`)
  }
  planos.b = await plano(contas.b, 'padrao')
  planos.b2 = await plano(contas.b, 'consultiva')
  for (const id of [planos.b, planos.b2]) {
    if ((await pagar(contas.b, id)).resultado.situacao !== 'pago') throw new Error('pagar b')
  }
  planos.s = await plano(contas.s, 'padrao', periodos.semestral)
  if ((await pagar(contas.s, planos.s)).resultado.situacao !== 'pago') throw new Error('pagar s')
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  sairDaSessao()
  const ids = Object.values(contas).map((c) => c.id)
  const lista = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  const txids = (await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))).map((c) => c.txid)
  if (txids.length) await db.delete(efiWebhookEventos).where(inArray(efiWebhookEventos.txid, txids))
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

describe('o primeiro mês', () => {
  it('1. já pago (na contratação) não é cobrado de novo — nem antes da janela do mês 2', async () => {
    expect(await iniciar(contas.a, planos.a)).toEqual({ situacao: 'pago' })
    await relogio(dia('2027-01-30'))
    expect(await iniciar(contas.a, planos.a)).toEqual({ situacao: 'pago' })
    expect(await cobrancasDe(planos.a)).toHaveLength(1)
    expect((await meses(planos.a)).map((m) => m.numero)).toEqual([1])
    const vista = await planoDoCliente(contas.a, planos.a)
    expect(vista.financeiro).toMatchObject({ situacao: 'em_dia', devida: null })
    expect(vista.financeiro?.atual).toMatchObject({ numero: 1, periodoInicio: '2027-01-10', periodoFim: '2027-02-09' })
  })
})

describe('o mês seguinte nasce na janela, uma vez só', () => {
  it('2. a véspera da janela não cria; no dia da janela (7 dias antes) nasce o mês 2', async () => {
    await relogio(dia('2027-02-02'))
    await prepararMensalidadesDosPlanos(new Date())
    expect((await meses(planos.a)).map((m) => m.numero)).toEqual([1])

    // Antes de a rotina rodar, "Meus planos" já mostra o mês devido.
    await relogio(dia('2027-02-03'))
    const antes = await planoDoCliente(contas.c, planos.c)
    expect(antes.financeiro).toMatchObject({
      situacao: 'aguardando_pagamento',
      devida: { numero: 2, periodoInicio: '2027-02-10', periodoFim: '2027-03-09', vencimento: '2027-02-10', situacao: 'aguardando_pagamento' },
    })
    expect((await meses(planos.c)).map((m) => m.numero)).toEqual([1])
  })

  it('19. duas rotinas e uma preparação simultâneas criam um único mês 2 por plano', async () => {
    await Promise.all([
      prepararMensalidadesDosPlanos(new Date()),
      prepararMensalidadesDosPlanos(new Date()),
      db.transaction((tx) => prepararMensalidadesDaAssinatura(tx, planos.f, new Date())),
    ])
    for (const id of [planos.a, planos.b, planos.b2, planos.c, planos.d, planos.e, planos.f]) {
      const lista = await meses(id)
      expect(lista.map((m) => m.numero)).toEqual([1, 2])
      expect(lista[1]).toMatchObject({ status: 'prevista', inicio: '2027-02-10', fim: '2027-03-09' })
    }
    // E mais uma vez, depois: nada novo.
    expect(await prepararMensalidadesDosPlanos(new Date())).toMatchObject({ criadas: 0 })
    const auditados = await db
      .select({ id: eventosAuditoria.id })
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.acao, 'mensalidade_disponibilizada'), eq(eventosAuditoria.registroAfetado, planos.f)))
    expect(auditados).toHaveLength(1)
  })
})

describe('Pix da mensalidade', () => {
  it('3 e 4. o mês 2 ganha Pix próprio, é pago pela Efí e fica quitado; o período começa e ele entra em andamento', async () => {
    const valor = (await mes(planos.a, 2)).valor
    const { emitida, resultado } = await pagar(contas.a, planos.a)
    expect(emitida.valorCentavos).toBe(valor)
    expect(emitida.descricao).toContain('10/02 a 09/03')
    expect((await cobranca(emitida.id)).contexto).toMatchObject({ competenciaNumero: 2 })
    expect(resultado).toEqual({ situacao: 'pago' })
    expect(await pagoPorMes(planos.a)).toEqual(new Map([[1, valor], [2, valor]]))
    // Pago adiantado: ainda não é o período dele.
    expect((await mes(planos.a, 2)).status).toBe('prevista')
    // Mês quitado não ganha outro Pix.
    expect(await iniciar(contas.a, planos.a)).toEqual({ situacao: 'pago' })

    await relogio(dia('2027-02-10'))
    expect(await prepararMensalidadesDosPlanos(new Date())).toMatchObject({ criadas: 0 })
    expect((await mes(planos.a, 2)).status).toBe('em_andamento')
  })

  it('8. o mês pago segue o fluxo normal de conclusão', async () => {
    expect(await cumprir(planos.a, 1)).toMatchObject({ ok: true, jaEstavaCumprida: false })
    expect(await cumprir(planos.a, 2)).toMatchObject({ ok: true, jaEstavaCumprida: false })
    expect(await cumprir(planos.a, 2)).toMatchObject({ ok: true, jaEstavaCumprida: true })
  })

  it('5 e 6. o mês 3 é pago sem nova contratação, com o mesmo contador', async () => {
    await relogio(dia('2027-03-03'))
    // Sem rotina: o próprio "Pagar mensalidade" prepara o mês.
    const { emitida, resultado } = await pagar(contas.a, planos.a)
    expect(resultado).toEqual({ situacao: 'pago' })
    expect((await cobranca(emitida.id)).contexto).toMatchObject({ competenciaNumero: 3 })
    expect([...(await pagoPorMes(planos.a)).keys()].sort()).toEqual([1, 2, 3])
    const doCliente = await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.clienteUsuarioId, contas.a.id))
    expect(doCliente).toHaveLength(1)
    expect((await linha(planos.a)).prestadorId).toBe(contas.parceiro.id)
    const carteira = await listarClientesVincisDoContador(contas.parceiro.id)
    expect(carteira.find((c) => c.assinaturaId === planos.a)?.financeiro).toMatchObject({ situacao: 'em_dia' })
  })
})

describe('atraso', () => {
  it('9. mês não pago não pode ser concluído', async () => {
    expect(await cumprir(planos.c, 2)).toEqual({ ok: false, motivo: 'pagamento_nao_confirmado' })
    expect((await mes(planos.c, 2)).status).toBe('prevista')
  })

  it('10 e 11. vencido aparece em atraso; conta, plano, contador e histórico continuam', async () => {
    const vista = await planoDoCliente(contas.c, planos.c)
    expect(vista.status).toBe('ativa')
    expect(vista.financeiro).toMatchObject({
      situacao: 'em_atraso',
      devida: { numero: 2, situacao: 'em_atraso', vencimento: '2027-02-10' },
    })
    // Em 03/03 a janela do mês 3 também abriu: o histórico mostra os dois em aberto.
    expect(vista.financeiro?.historico.map((m) => [m.numero, m.situacao])).toEqual([
      [3, 'aguardando_pagamento'],
      [2, 'em_atraso'],
      [1, 'paga'],
    ])
    const carteira = await listarClientesVincisDoContador(contas.parceiro.id)
    expect(carteira.find((c) => c.assinaturaId === planos.c)?.financeiro).toMatchObject({ situacao: 'em_atraso' })
    expect(await linha(planos.c)).toMatchObject({ status: 'ativa', prestadorId: contas.parceiro.id })
    const [conta] = await db.select({ status: usuarios.status }).from(usuarios).where(eq(usuarios.id, contas.c.id))
    expect(conta.status).toBe('ativo')
    expect((await pagamentosDe(planos.c)).every((p) => p.status === 'confirmado')).toBe(true)
    expect((await mes(planos.c, 1)).status).toBe('em_andamento')
  })

  it('7. capacidade: cliente atrasado continua ocupando a vaga, e dois planos do mesmo cliente contam uma', async () => {
    const ocupacao = await ocupacaoDoContador(contas.parceiro.id)
    // a, b (2 planos), c, d, e, f, s: sete clientes, oito planos.
    expect(ocupacao).toMatchObject({ ativos: 7, ocupados: 7 })
  })

  it('12. Pix expirado permite nova tentativa, para o mesmo mês e valor', async () => {
    const primeiro = await emitir(contas.c, planos.c)
    expect((await cobranca(primeiro.id)).contexto).toMatchObject({ competenciaNumero: 2 })
    // Mesmo Pix enquanto está vivo.
    expect((await emitir(contas.c, planos.c)).id).toBe(primeiro.id)
    await relogio(new Date(Date.now() + 2 * 3600_000))
    const segundo = await emitir(contas.c, planos.c)
    expect(segundo.id).not.toBe(primeiro.id)
    expect(segundo.valorCentavos).toBe(primeiro.valorCentavos)
    expect((await cobranca(primeiro.id)).status).toBe('expirada')
    expect((await cobranca(segundo.id)).contexto).toMatchObject({ competenciaNumero: 2 })
  })

  it('13. webhook duplicado (e o polling junto) registra um pagamento só', async () => {
    const [viva] = (await cobrancasDe(planos.c)).filter((c) => c.status === 'aguardando_pagamento')
    efiDeTeste.pagar(viva.txid)
    const aviso = lerAvisosDePix({ pix: [{ endToEndId: `E2E${viva.txid}`.slice(0, 32), txid: viva.txid }] })
    await processarAvisosDePix(aviso)
    await processarAvisosDePix(aviso)
    await processarAvisosDePix(lerAvisosDePix({ pix: [{ endToEndId: 'E2EOUTRO0000000000000000000001', txid: viva.txid }] }))
    await acompanhar(contas.c, planos.c)
    const doPix = (await pagamentosDe(planos.c)).filter((p) => p.idExterno === viva.txid)
    expect(doPix).toHaveLength(1)
    const pagos = await pagoPorMes(planos.c)
    expect(pagos.get(2)).toBe((await mes(planos.c, 2)).valor)
    expect(pagos.has(3)).toBe(false)
    // Pago com atraso, já no período: o mês entra em andamento e pode ser concluído.
    expect((await mes(planos.c, 2)).status).toBe('em_andamento')
    expect(await cumprir(planos.c, 2)).toMatchObject({ ok: true })
  })

  it('14. com dois meses em aberto, paga-se o mais antigo; Pix velho pago tarde não quita o mês seguinte', async () => {
    await relogio(dia('2027-03-05'))
    // d: mês 2 em atraso e mês 3 aguardando.
    const pixVelho = await emitir(contas.d, planos.d)
    expect((await cobranca(pixVelho.id)).contexto).toMatchObject({ competenciaNumero: 2 })
    await relogio(new Date(Date.now() + 2 * 3600_000))
    const { emitida, resultado } = await pagar(contas.d, planos.d)
    expect(emitida.id).not.toBe(pixVelho.id)
    expect(resultado).toEqual({ situacao: 'pago' })
    expect([...(await pagoPorMes(planos.d)).keys()].sort()).toEqual([1, 2])

    // O Pix vencido também foi pago, tarde: vira conflito, o mês 3 continua em aberto.
    efiDeTeste.pagar((await cobranca(pixVelho.id)).txid)
    await sincronizarCobranca(pixVelho.id, { forcar: true })
    expect(await cobranca(pixVelho.id)).toMatchObject({ status: 'paga', efeito: 'conflito' })
    expect([...(await pagoPorMes(planos.d)).keys()].sort()).toEqual([1, 2])
    expect((await planoDoCliente(contas.d, planos.d)).financeiro?.devida).toMatchObject({ numero: 3 })
  })
})

describe('cancelamento', () => {
  it('15 e 20. Pix da mensalidade pago depois do cancelamento não reativa; nada novo é cobrado ou criado', async () => {
    const pix = await emitir(contas.e, planos.e)
    expect((await comSessao(contas.e.token, () => cancelarMeuPlano({ assinaturaId: planos.e }))).sucesso).toBe(true)
    efiDeTeste.pagar((await cobranca(pix.id)).txid)
    await sincronizarCobranca(pix.id, { forcar: true })
    expect(await cobranca(pix.id)).toMatchObject({ status: 'paga', efeito: 'conflito' })
    expect((await linha(planos.e)).status).toBe('cancelada')
    const txid = (await cobranca(pix.id)).txid
    expect((await pagamentosDe(planos.e)).filter((p) => p.idExterno === txid)).toHaveLength(0)
    expect((await pagoPorMes(planos.e)).has(2)).toBe(false)

    expect((await iniciar(contas.e, planos.e)).situacao).toBe('recusado')
    await relogio(dia('2027-04-05'))
    await prepararMensalidadesDosPlanos(new Date())
    expect((await meses(planos.e)).map((m) => [m.numero, m.status])).toEqual([
      [1, 'em_andamento'],
      [2, 'cancelada'],
      // O mês 3 nasceu quando o cliente pediu o Pix (janela aberta em 03/03); o cancelamento o encerrou.
      [3, 'cancelada'],
    ])
    expect((await planoDoCliente(contas.e, planos.e)).financeiro?.situacao).toBeNull()
  })
})

describe('o que não muda', () => {
  it('16. semestral pago adiantado não ganha mensalidade nem Pix', async () => {
    await relogio(dia('2027-07-05'))
    await prepararMensalidadesDosPlanos(new Date())
    expect((await meses(planos.s)).map((m) => m.numero)).toEqual([1, 2, 3, 4, 5, 6])
    expect(await iniciar(contas.s, planos.s)).toEqual({ situacao: 'pago' })
    expect(await cobrancasDe(planos.s)).toHaveLength(1)
    const vista = await planoDoCliente(contas.s, planos.s)
    expect(vista.financeiro?.situacao).toBeNull()
    // Semestral segue podendo cumprir os meses pagos adiantado.
    expect(await cumprir(planos.s, 2)).toMatchObject({ ok: true })
  })

  it('17 e 18. Autônomo e advogado não entram em plano Vincis — logo, nunca em mensalidade Vincis', async () => {
    expect((await contratar(contas.f, { escolha: 'cliente', contadorId: contas.autonomo.id })).sucesso).toBe(false)
    expect((await contratar(contas.f, { escolha: 'cliente', contadorId: contas.advogado.id })).sucesso).toBe(false)
    const comEles = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(inArray(assinaturas.prestadorId, [contas.autonomo.id, contas.advogado.id]))
    expect(comEles).toHaveLength(0)
    const cobrancasDeles = await db
      .select({ id: cobrancasPix.id })
      .from(cobrancasPix)
      .where(inArray(cobrancasPix.prestadorId, [contas.autonomo.id, contas.advogado.id]))
    expect(cobrancasDeles).toHaveLength(0)
  })
})
