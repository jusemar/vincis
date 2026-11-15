import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Capacidade do contador parceiro com reserva de vaga.
 *
 * Ocupação = clientes ativos + planos pendentes já alocados (reserva). Pix
 * vencido ou cancelado e plano cancelado liberam a reserva; o Pix novo só sai
 * depois de conferir a vaga de novo. Efí de teste; o resto é real.
 */
const { eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const { assinaturas, cobrancasPix, eventosAuditoria, perfisProfissionais } = await import('@/db/schema')
const { alocarContadorResponsavel } = await import('@/features/assinaturas/actions/alocar-contador')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { escolherContadorDoPlanoPendente } = await import('@/features/assinaturas/actions/escolher-contador-pendente')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { rotuloDaCapacidade } = await import('@/features/assinaturas/constants/contador-responsavel')
const { ocupacaoDoContador } = await import('@/features/assinaturas/queries/carteira-do-contador')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { definirCapacidadeClientes } = await import('@/features/profissionais/actions/capacidade')
const { contadorParceiroElegivel, listarContadoresParceiros } = await import(
  '@/features/profissionais/queries/contadores-parceiros'
)
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@capacidade-reserva.teste'
const CLIENTES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'] as const
type Chave = 'parceiroA' | 'parceiroB' | 'gestor' | (typeof CLIENTES)[number]
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodoMensal: string
const planos: Partial<Record<(typeof CLIENTES)[number], string>> = {}

function contratar(cliente: Conta, contador: unknown) {
  return comSessao(cliente.token, () =>
    contratarPlanoVincis({ planoCodigo: 'padrao', periodoCodigo: periodoMensal, respostas, contador }),
  )
}

async function plano(chave: (typeof CLIENTES)[number], contador: unknown) {
  const r = await contratar(contas[chave], contador)
  if (!r.sucesso) throw new Error(r.mensagem)
  planos[chave] = r.dados!.assinaturaId
  return r.dados!.assinaturaId
}

async function txidDe(cobrancaId: string) {
  const [linha] = await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, cobrancaId))
  return linha.txid
}

async function emitirPix(chave: (typeof CLIENTES)[number]) {
  return comSessao(contas[chave].token, () => iniciarPagamentoDoPlano({ assinaturaId: planos[chave]! }))
}

async function pagar(chave: (typeof CLIENTES)[number]) {
  const emitida = await emitirPix(chave)
  if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
  efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
  return comSessao(contas[chave].token, () => acompanharPagamentoDoPlano({ assinaturaId: planos[chave]! }))
}

function capacidade(conta: Conta, valor: string) {
  return comSessao(contas.gestor.token, () => definirCapacidadeClientes({ usuarioId: conta.id, capacidade: valor }))
}

function alocar(assinaturaId: string, contadorId: string) {
  return comSessao(contas.gestor.token, () => alocarContadorResponsavel({ assinaturaId, contadorId, motivo: 'Teste de capacidade' }))
}

const A = () => contas.parceiroA
const escolherA = () => ({ escolha: 'cliente', contadorId: contas.parceiroA.id })

async function responsavel(assinaturaId: string) {
  return (await db.select({ id: assinaturas.prestadorId }).from(assinaturas).where(eq(assinaturas.id, assinaturaId)))[0].id
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      parceiroA: { perfil: 'profissional', prestador: 'profissional' },
      parceiroB: { perfil: 'profissional', prestador: 'profissional' },
      gestor: { perfil: 'gestor_vincis' },
      ...Object.fromEntries(CLIENTES.map((c) => [c, { perfil: 'cliente' }])),
    } as Record<Chave, { perfil: string; prestador?: 'profissional' }>,
    '119491',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'contabilidade', modeloContratacao: 'vincis' })
    .where(inArray(perfisProfissionais.usuarioId, [contas.parceiroA.id, contas.parceiroB.id]))
  const tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  const { calcularPreco } = await import('@/features/precificacao/lib/motor')
  periodoMensal = calcularPreco(tabela, 'padrao', respostas).periodos.find((p) => p.meses === 1)!.periodo
  expect((await capacidade(A(), '4')).sucesso).toBe(true)
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

describe('ocupação = ativos + reservas de planos pendentes', () => {
  it('1. cliente ativo conta 1 vaga', async () => {
    await plano('c1', escolherA())
    expect((await pagar('c1')).situacao).toBe('pago')
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 1, reservados: 0, ocupados: 1 })
  })

  it('2 e 3. plano pendente alocado reserva 1 vaga, e soma com os ativos', async () => {
    await plano('c2', escolherA())
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 1, reservados: 1, ocupados: 2 })
  })

  it('4. pendente que vira ativo não conta duas vezes', async () => {
    expect((await pagar('c2')).situacao).toBe('pago')
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 2, reservados: 0, ocupados: 2 })
  })

  it('5. Pix expirado libera a reserva', async () => {
    await plano('c3', escolherA())
    const emitida = await emitirPix('c3')
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    expect((await ocupacaoDoContador(A().id)).ocupados).toBe(3)
    await db.update(cobrancasPix).set({ status: 'expirada' }).where(eq(cobrancasPix.id, emitida.cobranca.id))
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 2, reservados: 0, ocupados: 2 })
    // O plano continua lá, com o mesmo responsável — só a vaga foi liberada.
    expect(await responsavel(planos.c3!)).toBe(A().id)
  })

  it('6. cancelamento libera a reserva', async () => {
    await plano('c4', escolherA())
    expect((await ocupacaoDoContador(A().id)).ocupados).toBe(3)
    await db.update(assinaturas).set({ status: 'cancelada' }).where(eq(assinaturas.id, planos.c4!))
    expect((await ocupacaoDoContador(A().id)).ocupados).toBe(2)
  })
})

describe('limite com ativos + reservas', () => {
  it('7. lotado por ativos + pendentes não aparece para escolha, e o servidor recusa', async () => {
    await plano('c5', escolherA())
    await plano('c6', escolherA())
    const a = await contadorParceiroElegivel(db, A().id)
    expect(a).toMatchObject({ ativos: 2, reservados: 2, ocupados: 4, lotado: true })
    expect(rotuloDaCapacidade(a!.capacidade, a!)).toBe('2 ativos + 2 aguardando pagamento · 4 de 4 vagas')
    const lista = await listarContadoresParceiros(undefined, { somenteComVaga: true })
    expect(lista.map((c) => c.id)).not.toContain(A().id)
    expect((await contratar(contas.c7, escolherA())).sucesso).toBe(false)
  })

  it('8. Gestor não aloca acima do limite', async () => {
    await plano('c7', { escolha: 'vincis' })
    const r = await alocar(planos.c7!, A().id)
    expect(r.sucesso).toBe(false)
    expect(r.mensagem).toMatch(/4 de 4 vagas/)
    expect(await responsavel(planos.c7!)).toBeNull()
  })

  it('Pix novo de plano com vaga liberada: sem vaga, não gera Pix e pede outra escolha', async () => {
    const antes = await db.select({ id: cobrancasPix.id }).from(cobrancasPix).where(eq(cobrancasPix.referenciaId, planos.c3!))
    const r = await emitirPix('c3')
    expect(r.situacao).toBe('contador_sem_vaga')
    if (r.situacao !== 'contador_sem_vaga') return
    expect(r.contadores.map((c) => c.id)).toContain(contas.parceiroB.id)
    expect(r.contadores.map((c) => c.id)).not.toContain(A().id)
    expect(await db.select({ id: cobrancasPix.id }).from(cobrancasPix).where(eq(cobrancasPix.referenciaId, planos.c3!))).toHaveLength(antes.length)

    const escolha = await comSessao(contas.c3.token, () =>
      escolherContadorDoPlanoPendente({ assinaturaId: planos.c3!, contador: { escolha: 'cliente', contadorId: contas.parceiroB.id } }),
    )
    expect(escolha.sucesso).toBe(true)
    expect((await emitirPix('c3')).situacao).toBe('cobranca')
    expect(await ocupacaoDoContador(contas.parceiroB.id)).toMatchObject({ reservados: 1, ocupados: 1 })
  })

  it('"Deixar a Vincis escolher" devolve o plano à fila, com histórico', async () => {
    await plano('c8', { escolha: 'cliente', contadorId: contas.parceiroB.id })
    const emitida = await emitirPix('c8')
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    await db.update(cobrancasPix).set({ status: 'expirada' }).where(eq(cobrancasPix.id, emitida.cobranca.id))
    expect((await capacidade(contas.parceiroB, '1')).sucesso).toBe(true)
    expect((await emitirPix('c8')).situacao).toBe('contador_sem_vaga')
    const r = await comSessao(contas.c8.token, () =>
      escolherContadorDoPlanoPendente({ assinaturaId: planos.c8!, contador: { escolha: 'vincis' } }),
    )
    expect(r.sucesso).toBe(true)
    const [linha] = await db.select().from(assinaturas).where(eq(assinaturas.id, planos.c8!))
    expect(linha).toMatchObject({ prestadorId: null, escolhaContador: 'vincis' })
    const historico = await db.execute<{ novo: string | null }>(
      sql`select contador_novo_id as novo from assinatura_contador_alocacoes where assinatura_id = ${planos.c8!} order by created_at`,
    )
    expect(historico.at(-1)?.novo).toBeNull()
    expect((await emitirPix('c8')).situacao).toBe('cobranca')
    expect((await capacidade(contas.parceiroB, '')).sucesso).toBe(true)
  })

  it('pagamento confirmado de quem reservava não é rechecado: vira ativo com o mesmo contador', async () => {
    // A está lotado (4 de 4) e c5 reservava uma dessas vagas.
    expect((await pagar('c5')).situacao).toBe('pago')
    expect(await responsavel(planos.c5!)).toBe(A().id)
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 3, reservados: 1, ocupados: 4 })
  })
})

describe('troca e redução de capacidade', () => {
  it('9. transferir pendente de A para B libera A e reserva B, com histórico', async () => {
    const bAntes = (await ocupacaoDoContador(contas.parceiroB.id)).ocupados
    expect((await alocar(planos.c6!, contas.parceiroB.id)).sucesso).toBe(true)
    expect(await ocupacaoDoContador(A().id)).toEqual({ ativos: 3, reservados: 0, ocupados: 3 })
    expect((await ocupacaoDoContador(contas.parceiroB.id)).ocupados).toBe(bAntes + 1)
    const historico = await db.execute<{ anterior: string | null; novo: string | null }>(
      sql`select contador_anterior_id as anterior, contador_novo_id as novo from assinatura_contador_alocacoes where assinatura_id = ${planos.c6!} order by created_at`,
    )
    expect(historico.map((h) => [h.anterior, h.novo])).toEqual([
      [null, A().id],
      [A().id, contas.parceiroB.id],
    ])
  })

  it('ativo transferido continua contando uma vez, agora no novo contador', async () => {
    const bAntes = await ocupacaoDoContador(contas.parceiroB.id)
    expect((await alocar(planos.c5!, contas.parceiroB.id)).sucesso).toBe(true)
    expect((await ocupacaoDoContador(A().id)).ativos).toBe(2)
    expect(await ocupacaoDoContador(contas.parceiroB.id)).toEqual({
      ativos: bAntes.ativos + 1,
      reservados: bAntes.reservados,
      ocupados: bAntes.ocupados + 1,
    })
  })

  it('10 e 11. reduzir abaixo do uso não remove ninguém e bloqueia novas entradas', async () => {
    const meus = await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.prestadorId, A().id))
    expect((await capacidade(A(), '1')).sucesso).toBe(true)
    const a = await contadorParceiroElegivel(db, A().id)
    expect(a).toMatchObject({ ocupados: 2, capacidade: 1, lotado: true, acimaDoLimite: true })
    expect(rotuloDaCapacidade(a!.capacidade, a!)).toBe('2 ativos · 2 de 1 vaga')
    expect(await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.prestadorId, A().id))).toEqual(meus)
    expect((await alocar(planos.c7!, A().id)).sucesso).toBe(false)
    expect((await contratar(contas.c9, escolherA())).sucesso).toBe(false)
  })
})

describe('concorrência', () => {
  it('12. duas contratações simultâneas não ocupam a última vaga duas vezes', async () => {
    const b = (await ocupacaoDoContador(contas.parceiroB.id)).ocupados
    expect((await capacidade(contas.parceiroB, String(b + 1))).sucesso).toBe(true)
    const escolherB = { escolha: 'cliente', contadorId: contas.parceiroB.id }
    const [r9, r10] = await Promise.all([contratar(contas.c9, escolherB), contratar(contas.c10, escolherB)])
    expect([r9.sucesso, r10.sucesso].filter(Boolean)).toHaveLength(1)
    expect((await ocupacaoDoContador(contas.parceiroB.id)).ocupados).toBe(b + 1)
  })
})
