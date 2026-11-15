import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Comissão Vincis em todo avulso pago pela plataforma, natureza da proposta
 * (avulsa × recorrente do Autônomo), capacidade do contador parceiro e a área
 * "Meus clientes Vincis" com a trava antes do pagamento.
 *
 * Efí de teste (`setup/efi-de-teste.ts`); todo o resto é real. O banco de
 * testes nasce com a comissão em 150 milésimos (`setup/global.ts`).
 */
const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturas,
  atendimentos,
  cobrancasPix,
  configuracoesPlataforma,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  consultoriaReservas,
  contratacoesServico,
  eventosAuditoria,
  oportunidadePagamentos,
  oportunidadeContrapropostas,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  servicos,
} = await import('@/db/schema')
const { alocarContadorResponsavel } = await import('@/features/assinaturas/actions/alocar-contador')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { ocupacaoDoContador, listarClientesVincisDoContador } = await import(
  '@/features/assinaturas/queries/carteira-do-contador'
)
const { salvarConsultoria, salvarDisponibilidades } = await import('@/features/consultorias/actions/consultoria')
const { acompanharPagamentoDaConsultoria, iniciarPagamentoDaConsultoria } = await import(
  '@/features/consultorias/actions/pagamento'
)
const { reservarHorarioDaConsultoria } = await import('@/features/consultorias/actions/reserva')
const { dataLocalDoInstante, diaDaSemanaDeDataLocal, somarDiasEmDataLocal } = await import(
  '@/features/consultorias/lib/tempo'
)
const { listarHorariosDoDia } = await import('@/features/consultorias/queries/agenda-publica')
const { aceitarProposta, criarContraproposta, responderContraproposta } = await import(
  '@/features/oportunidades/actions/negociacao'
)
const { situacaoDoAcordoParaPrestador } = await import('@/features/oportunidades/lib/situacao-do-acordo')
const { listarOportunidadesDoPrestador } = await import(
  '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
)
const { carregarOportunidadesDisponiveis, enviarProposta } = await import('@/features/oportunidades/actions/propostas')
const { acompanharPagamentoDoAcordo, iniciarPagamentoDoAcordo } = await import(
  '@/features/pagamentos/actions/pagamento-acordo'
)
const { pagarAcordoSimulado } = await import('@/features/pagamentos/actions/pagamento-simulado')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { definirCapacidadeClientes } = await import('@/features/profissionais/actions/capacidade')
const { contadorParceiroElegivel, listarContadoresParceiros, usuarioContadorParceiroVincis } = await import(
  '@/features/profissionais/queries/contadores-parceiros'
)
const { definirComissaoServicosAvulsos } = await import('@/features/servicos/actions/comissao')
const { acompanharPagamentoDoServico, iniciarPagamentoDoServico } = await import('@/features/servicos/actions/contratar')
const { CHAVE_COMISSAO_SERVICOS_AVULSOS, MENSAGEM_COMISSAO_PENDENTE } = await import(
  '@/features/servicos/constants/comissao'
)
const { resolverAcessoUsuario } = await import('@/features/usuarios/queries/obter-destino-apos-login')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { COMISSAO_DE_TESTE_MILESIMOS } = await import('./setup/global')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@comissao-capacidade.teste'
const FUSO = 'America/Sao_Paulo'
type Chave =
  | 'parceiroA'
  | 'parceiroB'
  | 'autonomo'
  | 'vendedor'
  | 'clienteA'
  | 'clienteB'
  | 'clienteC'
  | 'clienteD'
  | 'gestor'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodoMensal: string
let dataAlvo: string
let horarios: string[]

async function definirConfiguracao(chave: string, valor: string | null) {
  if (valor === null) {
    await db.delete(configuracoesPlataforma).where(eq(configuracoesPlataforma.chave, chave))
    return
  }
  await db
    .insert(configuracoesPlataforma)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: configuracoesPlataforma.chave, set: { valor, atualizadoPor: null } })
}

async function txidDe(cobrancaId: string) {
  const [linha] = await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, cobrancaId))
  return linha.txid
}

/** Oportunidade privada para o prestador, com proposta já aceita no valor dado. */
async function acordoAceito(cliente: Conta, prestador: Conta, valor: number, natureza: 'avulsa' | 'recorrente' = 'avulsa') {
  const [oportunidade] = await db
    .insert(oportunidades)
    .values({
      clienteUsuarioId: cliente.id,
      categoria: 'contabilidade',
      titulo: 'Regularização fiscal',
      descricao: 'Preciso regularizar as obrigações fiscais da minha empresa.',
      visibilidade: 'privada',
      destinatarioId: prestador.id,
    })
    .returning({ id: oportunidades.id })
  await db.insert(oportunidadePropostas).values({
    oportunidadeId: oportunidade.id,
    prestadorId: prestador.id,
    mensagem: 'Faço o trabalho completo em até dez dias úteis.',
    valorCentavos: valor,
    valorAcordadoCentavos: valor,
    status: 'aceita',
    natureza,
  })
  return oportunidade.id
}

async function oportunidadeAberta(cliente: Conta, prestador: Conta) {
  const [oportunidade] = await db
    .insert(oportunidades)
    .values({
      clienteUsuarioId: cliente.id,
      categoria: 'contabilidade',
      titulo: 'Contabilidade mensal da empresa',
      descricao: 'Procuro um contador para acompanhar minha empresa todos os meses.',
      visibilidade: 'privada',
      destinatarioId: prestador.id,
    })
    .returning({ id: oportunidades.id })
  return oportunidade.id
}

function contratarPlano(cliente: Conta, contador: unknown) {
  return comSessao(cliente.token, () =>
    contratarPlanoVincis({ planoCodigo: 'padrao', periodoCodigo: periodoMensal, respostas, contador }),
  )
}

async function planoDoCliente(cliente: Conta, contador: unknown) {
  const r = await contratarPlano(cliente, contador)
  if (!r.sucesso) throw new Error(r.mensagem)
  return r.dados!.assinaturaId
}

async function pagarPlano(cliente: Conta, assinaturaId: string) {
  const emitida = await comSessao(cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId }))
  if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
  efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
  return comSessao(cliente.token, () => acompanharPagamentoDoPlano({ assinaturaId }))
}

function alocar(assinaturaId: string, contadorId: string, motivo?: string) {
  return comSessao(contas.gestor.token, () => alocarContadorResponsavel({ assinaturaId, contadorId, motivo }))
}

function capacidade(conta: Conta, valor: string) {
  return comSessao(contas.gestor.token, () => definirCapacidadeClientes({ usuarioId: conta.id, capacidade: valor }))
}

async function primeiroMes(assinaturaId: string) {
  const [mes] = await db
    .select({ id: assinaturaCompetencias.id })
    .from(assinaturaCompetencias)
    .where(and(eq(assinaturaCompetencias.assinaturaId, assinaturaId), eq(assinaturaCompetencias.numero, 1)))
  return mes.id
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      parceiroA: { perfil: 'profissional', prestador: 'profissional' },
      parceiroB: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      vendedor: { perfil: 'profissional', prestador: 'profissional' },
      clienteA: { perfil: 'cliente' },
      clienteB: { perfil: 'cliente' },
      clienteC: { perfil: 'cliente' },
      clienteD: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119481',
  )
  for (const [chave, modelo] of [
    ['parceiroA', 'vincis'],
    ['parceiroB', 'vincis'],
    ['autonomo', 'autonomo'],
    ['vendedor', 'vincis'],
  ] as const) {
    await db
      .update(perfisProfissionais)
      .set({ tipoProfissional: 'contabilidade', modeloContratacao: modelo })
      .where(eq(perfisProfissionais.usuarioId, contas[chave].id))
  }

  const tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  const { calcularPreco } = await import('@/features/precificacao/lib/motor')
  periodoMensal = calcularPreco(tabela, 'padrao', respostas).periodos.find((p) => p.meses === 1)!.periodo

  // Agenda de consultoria do "vendedor" (contador parceiro que vende avulso).
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
  await comSessao(contas.vendedor.token, async () => {
    const salva = await salvarConsultoria({
      titulo: 'Consultoria fiscal',
      descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
      valorCentavos: 20_000,
      duracaoMinutos: 60,
      intervaloMinutos: 15,
      antecedenciaMinimaMinutos: 120,
      horizonteDias: 60,
      timezone: FUSO,
    })
    if (!salva.sucesso) throw new Error(salva.mensagem)
    const faixas = await salvarDisponibilidades([
      { diaSemana: diaDaSemanaDeDataLocal(dataAlvo), horaInicio: '08:00', horaFim: '18:00' },
    ])
    if (!faixas.sucesso) throw new Error(faixas.mensagem)
  })
  horarios = (await listarHorariosDoDia({ prestadorId: contas.vendedor.id, data: dataAlvo })).horarios.map((h) => h.inicio)
  if (horarios.length < 3) throw new Error('Cenário sem horários suficientes.')
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  sairDaSessao()
  await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
  const ids = Object.values(contas).map((c) => c.id)
  const lista = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.usuarioId, ids), inArray(eventosAuditoria.autorId, ids)))
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(contratacoesServico).where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(consultoriaPagamentos).where(inArray(consultoriaPagamentos.prestadorId, ids))
  await db.delete(consultoriaAgendamentos).where(inArray(consultoriaAgendamentos.prestadorId, ids))
  await db.delete(consultoriaReservas).where(inArray(consultoriaReservas.clienteUsuarioId, ids))
  await db.delete(oportunidadePagamentos).where(inArray(oportunidadePagamentos.clienteUsuarioId, ids))
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  await db.execute(sql`delete from assinatura_contador_alocacoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamento_alocacoes where pagamento_id in (select p.id from assinatura_pagamentos p join assinaturas a on a.id = p.assinatura_id where a.cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamentos where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_competencias where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiro_atribuicoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinaturas where cliente_usuario_id in (${lista})`)
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.execute(sql`delete from consultoria_disponibilidades where configuracao_id in (select id from consultoria_configuracoes where prestador_id in (${lista}))`)
  await db.execute(sql`delete from consultoria_configuracoes where prestador_id in (${lista})`)
  await db.execute(sql`delete from notificacoes where autor_id in (${lista}) or destinatario_id in (${lista})`)
  await limparContas(SUFIXO)
})

describe('comissão Vincis em todo serviço avulso pago pela plataforma', () => {
  it('1. serviço fixo do catálogo pago pela Vincis grava a comissão configurada', async () => {
    const [servico] = await db
      .insert(servicos)
      .values({ prestadorId: contas.vendedor.id, nome: 'Abertura de MEI', descricaoCurta: 'Formalização do MEI.', modeloPreco: 'fixo', valorCentavos: 30_000 })
      .returning({ id: servicos.id })
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoServico({ servicoId: servico.id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    await comSessao(contas.clienteA.token, () => acompanharPagamentoDoServico({ cobrancaId: emitida.cobranca.id }))
    const [contratacao] = await db.select().from(contratacoesServico).where(eq(contratacoesServico.servicoId, servico.id))
    expect(contratacao).toMatchObject({
      comissaoVincisMilesimos: COMISSAO_DE_TESTE_MILESIMOS,
      comissaoVincisCentavos: 4_500,
      valorProfissionalCentavos: 25_500,
    })
  })

  it('2. proposta avulsa aceita e paga pela Vincis grava a comissão no pagamento', async () => {
    const id = await acordoAceito(contas.clienteA, contas.vendedor, 80_000)
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    const [cobranca] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
    expect(cobranca.contexto).toMatchObject({ comissaoVincis: { milesimos: 150, comissaoCentavos: 12_000, profissionalCentavos: 68_000 } })
    efiDeTeste.pagar(cobranca.txid)
    expect((await comSessao(contas.clienteA.token, () => acompanharPagamentoDoAcordo({ oportunidadeId: id }))).situacao).toBe('pago')
    const [pagamento] = await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))
    expect(pagamento).toMatchObject({ comissaoVincisMilesimos: 150, comissaoVincisCentavos: 12_000, valorProfissionalCentavos: 68_000 })
  })

  it('3. consultoria avulsa paga pela Vincis grava a comissão no pagamento', async () => {
    const reserva = await comSessao(contas.clienteB.token, () =>
      reservarHorarioDaConsultoria({ prestadorId: contas.vendedor.id, data: dataAlvo, inicio: horarios[0], descricao: 'Quero revisar meu regime tributário.' }),
    )
    if (reserva.situacao !== 'reservado') throw new Error(reserva.situacao)
    const emitida = await comSessao(contas.clienteB.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.reserva.id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    await comSessao(contas.clienteB.token, () => acompanharPagamentoDaConsultoria({ reservaId: reserva.reserva.id }))
    const [pagamento] = await db.select().from(consultoriaPagamentos).where(eq(consultoriaPagamentos.reservaId, reserva.reserva.id))
    expect(pagamento).toMatchObject({ comissaoVincisMilesimos: 150, comissaoVincisCentavos: 3_000, valorProfissionalCentavos: 17_000 })
  })

  it('4. comissão do parceiro indicador não interfere: chaves separadas, nenhuma lê a outra', async () => {
    const regrasAntes = await db.execute(sql`select t::text from parceiro_nivel_regras t order by 1`)
    const id = await acordoAceito(contas.clienteC, contas.vendedor, 10_000)
    const emitida = await comSessao(contas.clienteC.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    const [cobranca] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
    // O percentual é só o da configuração Vincis; Bronze/Prata/Ouro não entram.
    expect((cobranca.contexto as { comissaoVincis: { milesimos: number } }).comissaoVincis.milesimos).toBe(COMISSAO_DE_TESTE_MILESIMOS)
    expect(await db.execute(sql`select t::text from parceiro_nivel_regras t order by 1`)).toEqual(regrasAntes)
    const comissoesParceiro = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from parceiro_comissoes where cliente_usuario_id = ${contas.clienteC.id}`,
    )
    expect(Number(comissoesParceiro[0]?.total ?? 0)).toBe(0)
  })

  it('5. mudar a configuração depois não altera o retrato de pagamentos antigos', async () => {
    const id = await acordoAceito(contas.clienteD, contas.vendedor, 50_000)
    const emitida = await comSessao(contas.clienteD.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    // A Gestão muda para 20% depois de o Pix ter sido emitido.
    const mudou = await comSessao(contas.gestor.token, () => definirComissaoServicosAvulsos({ percentual: '20' }))
    expect(mudou.sucesso).toBe(true)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    await comSessao(contas.clienteD.token, () => acompanharPagamentoDoAcordo({ oportunidadeId: id }))
    const [pagamento] = await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))
    expect(pagamento).toMatchObject({ comissaoVincisMilesimos: 150, comissaoVincisCentavos: 7_500, valorProfissionalCentavos: 42_500 })
    const [antigo] = await db.select().from(contratacoesServico).where(eq(contratacoesServico.prestadorId, contas.vendedor.id))
    expect(antigo.comissaoVincisMilesimos).toBe(150)
    await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
  })

  it('6. sem comissão configurada nenhum Pix avulso nasce (catálogo, acordo e consultoria)', async () => {
    await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, null)
    try {
      const antes = await db.select({ id: cobrancasPix.id }).from(cobrancasPix).where(eq(cobrancasPix.prestadorId, contas.vendedor.id))
      const id = await acordoAceito(contas.clienteA, contas.vendedor, 40_000)
      const acordo = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
      expect(acordo).toEqual({ situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE })

      const [servico] = await db
        .insert(servicos)
        .values({ prestadorId: contas.vendedor.id, nome: 'Declaração IRPF', descricaoCurta: 'IRPF completo.', modeloPreco: 'fixo', valorCentavos: 20_000 })
        .returning({ id: servicos.id })
      const catalogo = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoServico({ servicoId: servico.id }))
      expect(catalogo.situacao).toBe('indisponivel')

      const reserva = await comSessao(contas.clienteA.token, () =>
        reservarHorarioDaConsultoria({ prestadorId: contas.vendedor.id, data: dataAlvo, inicio: horarios[1], descricao: 'Dúvidas sobre o Simples Nacional.' }),
      )
      if (reserva.situacao !== 'reservado') throw new Error(reserva.situacao)
      const consultoria = await comSessao(contas.clienteA.token, () => iniciarPagamentoDaConsultoria({ reservaId: reserva.reserva.id }))
      expect(consultoria).toEqual({ situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE })

      const depois = await db.select({ id: cobrancasPix.id }).from(cobrancasPix).where(eq(cobrancasPix.prestadorId, contas.vendedor.id))
      expect(depois).toHaveLength(antes.length)
    } finally {
      await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
    }
  })
})

describe('natureza da proposta: avulsa × recorrente do Autônomo', () => {
  it('7. proposta recorrente do Autônomo: aceite abre o atendimento sem Pix, cobrança nem comissão', async () => {
    const id = await oportunidadeAberta(contas.clienteB, contas.autonomo)
    const enviada = await comSessao(contas.autonomo.token, () =>
      enviarProposta({ oportunidadeId: id, mensagem: 'Acompanho sua contabilidade todos os meses, com pagamento direto.', valor: '450,00', natureza: 'recorrente' }),
    )
    if (!enviada.sucesso) throw new Error(enviada.mensagem)
    const [proposta] = await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(proposta.natureza).toBe('recorrente')

    const aceite = await comSessao(contas.clienteB.token, () => aceitarProposta({ propostaId: proposta.id }))
    expect(aceite.sucesso).toBe(true)
    expect(await db.select().from(atendimentos).where(eq(atendimentos.oportunidadeId, id))).toHaveLength(1)

    const pix = await comSessao(contas.clienteB.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    expect(pix.situacao).toBe('indisponivel')
    const simulado = await comSessao(contas.clienteB.token, () => pagarAcordoSimulado({ oportunidadeId: id }))
    expect(simulado.sucesso).toBe(false)
    expect(await db.select().from(cobrancasPix).where(eq(cobrancasPix.referenciaId, id))).toHaveLength(0)
    expect(await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))).toHaveLength(0)
    expect(await db.select().from(assinaturas).where(eq(assinaturas.clienteUsuarioId, contas.clienteB.id))).toHaveLength(0)
  })

  it('recorrente é exclusiva do Autônomo: contador parceiro Vincis é recusado no servidor', async () => {
    const id = await oportunidadeAberta(contas.clienteC, contas.parceiroA)
    const r = await comSessao(contas.parceiroA.token, () =>
      enviarProposta({ oportunidadeId: id, mensagem: 'Acompanhamento mensal com pagamento direto para mim.', valor: '400', natureza: 'recorrente' }),
    )
    expect(r.sucesso).toBe(false)
    expect(await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, id))).toHaveLength(0)
    // O formulário só oferece a escolha ao Autônomo.
    expect((await comSessao(contas.parceiroA.token, () => carregarOportunidadesDisponiveis())).dados?.podeProporRecorrente).toBe(false)
    expect((await comSessao(contas.autonomo.token, () => carregarOportunidadesDisponiveis())).dados?.podeProporRecorrente).toBe(true)
  })

  it('8. proposta avulsa do Autônomo gera Pix Vincis com a comissão obrigatória', async () => {
    const id = await oportunidadeAberta(contas.clienteC, contas.autonomo)
    const enviada = await comSessao(contas.autonomo.token, () =>
      enviarProposta({ oportunidadeId: id, mensagem: 'Faço a declaração do IRPF completa e entrego em uma semana.', valor: '300,00', natureza: 'avulsa' }),
    )
    if (!enviada.sucesso) throw new Error(enviada.mensagem)
    const [proposta] = await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(proposta.natureza).toBe('avulsa')
    await comSessao(contas.clienteC.token, () => aceitarProposta({ propostaId: proposta.id }))
    // Avulso: o atendimento só nasce com o pagamento.
    expect(await db.select().from(atendimentos).where(eq(atendimentos.oportunidadeId, id))).toHaveLength(0)

    const emitida = await comSessao(contas.clienteC.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    await comSessao(contas.clienteC.token, () => acompanharPagamentoDoAcordo({ oportunidadeId: id }))
    const [pagamento] = await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))
    expect(pagamento).toMatchObject({ comissaoVincisMilesimos: 150, comissaoVincisCentavos: 4_500, valorProfissionalCentavos: 25_500 })
  })
})

describe('capacidade do contador parceiro', () => {
  let planoPendenteA: string

  it('9. abaixo da capacidade aparece para o cliente escolher', async () => {
    expect((await capacidade(contas.parceiroA, '1')).sucesso).toBe(true)
    const lista = await listarContadoresParceiros(undefined, { somenteComVaga: true })
    expect(lista.map((c) => c.id)).toContain(contas.parceiroA.id)
    expect(lista.find((c) => c.id === contas.parceiroA.id)).toMatchObject({ capacidade: 1, ativos: 0, lotado: false })
  })

  it('16. contratação não paga com Pix vencido não consome capacidade', async () => {
    planoPendenteA = await planoDoCliente(contas.clienteA, { escolha: 'cliente', contadorId: contas.parceiroA.id })
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoPlano({ assinaturaId: planoPendenteA }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    await db.update(cobrancasPix).set({ status: 'expirada' }).where(eq(cobrancasPix.id, emitida.cobranca.id))
    // Pix vencido libera a reserva de vaga.
    expect((await ocupacaoDoContador(contas.parceiroA.id)).ocupados).toBe(0)
    expect((await contadorParceiroElegivel(db, contas.parceiroA.id))?.lotado).toBe(false)
    const carteira = await listarClientesVincisDoContador(contas.parceiroA.id)
    expect(carteira.find((c) => c.assinaturaId === planoPendenteA)).toMatchObject({
      situacao: 'aguardando_pagamento',
      ultimaCobranca: 'expirada',
    })
  })

  it('10. no limite não aparece para novos clientes, e a action também recusa', async () => {
    const outro = await planoDoCliente(contas.clienteB, { escolha: 'cliente', contadorId: contas.parceiroA.id })
    expect((await pagarPlano(contas.clienteB, outro)).situacao).toBe('pago')
    expect((await contadorParceiroElegivel(db, contas.parceiroA.id))).toMatchObject({ ativos: 1, lotado: true })
    const lista = await listarContadoresParceiros(undefined, { somenteComVaga: true })
    expect(lista.map((c) => c.id)).not.toContain(contas.parceiroA.id)
    const recusado = await contratarPlano(contas.clienteC, { escolha: 'cliente', contadorId: contas.parceiroA.id })
    expect(recusado.sucesso).toBe(false)
    // Os atuais continuam: o plano pago segue com ele.
    expect((await db.select().from(assinaturas).where(eq(assinaturas.id, outro)))[0].prestadorId).toBe(contas.parceiroA.id)
  })

  it('11. Gestor não ultrapassa a capacidade, mas pode tirar clientes de quem está no limite', async () => {
    const plano = await planoDoCliente(contas.clienteC, { escolha: 'vincis' })
    const recusada = await alocar(plano, contas.parceiroA.id)
    expect(recusada.sucesso).toBe(false)
    expect(recusada.mensagem).toMatch(/1 de 1 vagas/)
    expect((await db.select().from(assinaturas).where(eq(assinaturas.id, plano)))[0].prestadorId).toBeNull()

    // Retirar do contador lotado (A → B) é livre.
    const [pago] = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(and(eq(assinaturas.prestadorId, contas.parceiroA.id), eq(assinaturas.status, 'ativa')))
    expect((await alocar(pago.id, contas.parceiroB.id, 'Redistribuição de carteira')).sucesso).toBe(true)
    expect((await contadorParceiroElegivel(db, contas.parceiroA.id))?.lotado).toBe(false)

    // Sem limite volta a aceitar; capacidade inválida é recusada.
    expect((await capacidade(contas.parceiroA, '0')).sucesso).toBe(false)
    expect((await capacidade(contas.autonomo, '5')).sucesso).toBe(false)
    expect((await capacidade(contas.parceiroA, '')).sucesso).toBe(true)
    const [perfil] = await db
      .select({ capacidade: perfisProfissionais.capacidadeClientesRecorrentes })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, contas.parceiroA.id))
    expect(perfil.capacidade).toBeNull()
  })

  it('12. troca A → B preserva plano, valores, competências e pagamentos, com histórico', async () => {
    const [plano] = await db.select().from(assinaturas).where(and(eq(assinaturas.clienteUsuarioId, contas.clienteB.id), eq(assinaturas.status, 'ativa')))
    expect(plano.prestadorId).toBe(contas.parceiroB.id)
    const meses = await db.select().from(assinaturaCompetencias).where(eq(assinaturaCompetencias.assinaturaId, plano.id))
    expect(meses.length).toBeGreaterThan(0)
    const pagos = await db.execute<{ total: number }>(sql`select count(*)::int as total from assinatura_pagamentos where assinatura_id = ${plano.id}`)
    expect(Number(pagos[0].total)).toBe(1)
    const historico = await db.execute<{ anterior: string; novo: string; motivo: string | null }>(
      sql`select contador_anterior_id as anterior, contador_novo_id as novo, motivo from assinatura_contador_alocacoes where assinatura_id = ${plano.id} order by created_at`,
    )
    expect(historico.map((h) => [h.anterior, h.novo])).toEqual([
      [null, contas.parceiroA.id],
      [contas.parceiroA.id, contas.parceiroB.id],
    ])
    expect(historico[1].motivo).toBe('Redistribuição de carteira')
    // A deixa de ver; B passa a ver.
    expect((await listarClientesVincisDoContador(contas.parceiroA.id)).map((c) => c.assinaturaId)).not.toContain(plano.id)
    expect((await listarClientesVincisDoContador(contas.parceiroB.id)).map((c) => c.assinaturaId)).toContain(plano.id)
  })
})

describe('Meus clientes Vincis e pagamento não confirmado', () => {
  let plano: string

  it('13. contratação aguardando pagamento aparece ao contador como pendente', async () => {
    plano = await planoDoCliente(contas.clienteD, { escolha: 'cliente', contadorId: contas.parceiroB.id })
    const item = (await listarClientesVincisDoContador(contas.parceiroB.id)).find((c) => c.assinaturaId === plano)
    expect(item).toMatchObject({ situacao: 'aguardando_pagamento', statusPlano: 'aguardando_pagamento' })
  })

  it('14. antes do pagamento a prestação não começa', async () => {
    expect(await cumprirCompetencia({ competenciaId: await primeiroMes(plano) })).toEqual({
      ok: false,
      motivo: 'pagamento_nao_confirmado',
    })
  })

  it('15. a confirmação Efí libera sozinha, sem passo do Gestor', async () => {
    expect((await pagarPlano(contas.clienteD, plano)).situacao).toBe('pago')
    const item = (await listarClientesVincisDoContador(contas.parceiroB.id)).find((c) => c.assinaturaId === plano)
    expect(item?.situacao).toBe('liberada')
    expect(await cumprirCompetencia({ competenciaId: await primeiroMes(plano) })).toMatchObject({ ok: true })
  })

  it('17. cada contador vê só os planos de que é responsável', async () => {
    const deA = await listarClientesVincisDoContador(contas.parceiroA.id)
    const deB = await listarClientesVincisDoContador(contas.parceiroB.id)
    const ids = (lista: typeof deA) => lista.map((c) => c.assinaturaId)
    expect(ids(deA).filter((id) => ids(deB).includes(id))).toEqual([])
    const responsaveis = await db
      .select({ id: assinaturas.id, prestadorId: assinaturas.prestadorId })
      .from(assinaturas)
      .where(inArray(assinaturas.id, [...ids(deA), ...ids(deB)]))
    for (const linha of responsaveis) {
      expect(linha.prestadorId).toBe(ids(deA).includes(linha.id) ? contas.parceiroA.id : contas.parceiroB.id)
    }
  })

  it('18. Autônomo não recebe a área "Meus clientes Vincis"', async () => {
    expect(await usuarioContadorParceiroVincis(contas.autonomo.id)).toBe(false)
    expect((await resolverAcessoUsuario(contas.autonomo.id))?.contadorParceiroVincis).toBe(false)
    expect(await listarClientesVincisDoContador(contas.autonomo.id)).toEqual([])
    expect(await usuarioContadorParceiroVincis(contas.parceiroA.id)).toBe(true)
    expect((await resolverAcessoUsuario(contas.parceiroA.id))?.contadorParceiroVincis).toBe(true)
  })
})

/*
  Regressão (Teste 5): o aceite de proposta recorrente do Autônomo abria o
  atendimento e a tela do contador dizia "Pagamento aprovado" — sem pagamento
  nenhum. "Pagamento aprovado" só com pagamento registrado pela Vincis.
*/
describe('pagamento aprovado × proposta aceita sem pagamento intermediado', () => {
  async function oportunidadeDoPrestador(prestador: Conta, oportunidadeId: string) {
    const item = (await listarOportunidadesDoPrestador(prestador.id)).find((o) => o.id === oportunidadeId)
    if (!item) throw new Error('oportunidade não listada ao prestador')
    return item
  }
  const situacao = (item: Awaited<ReturnType<typeof oportunidadeDoPrestador>>) =>
    situacaoDoAcordoParaPrestador({
      pagoEm: item.pagoEm,
      natureza: item.minhaProposta!.natureza,
      protocolo: item.atendimento?.protocolo ?? null,
    })

  it('regra pura: só pagamento registrado vira "Pagamento aprovado"; recorrente nunca "aguarda pagamento"', () => {
    expect(situacaoDoAcordoParaPrestador({ pagoEm: '2026-11-15T10:00:00Z', natureza: 'avulsa', protocolo: '#2026-0001' })).toEqual({
      tipo: 'pagamento_aprovado',
      texto: 'Pagamento aprovado · Atendimento #2026-0001 aberto.',
    })
    expect(situacaoDoAcordoParaPrestador({ pagoEm: null, natureza: 'recorrente', protocolo: '#2026-0096' })).toEqual({
      tipo: 'proposta_aceita',
      texto: 'Proposta aceita · Atendimento #2026-0096 aberto.',
    })
    // Advogado (avulsa sem pagamento, atendimento aberto no aceite).
    expect(situacaoDoAcordoParaPrestador({ pagoEm: null, natureza: 'avulsa', protocolo: '#2026-0002' }).tipo).toBe('proposta_aceita')
    expect(situacaoDoAcordoParaPrestador({ pagoEm: null, natureza: 'recorrente', protocolo: null }).tipo).toBe('proposta_aceita')
    expect(situacaoDoAcordoParaPrestador({ pagoEm: null, natureza: 'avulsa', protocolo: null }).tipo).toBe('aguardando_pagamento')
  })

  it('recorrente do Autônomo aceita: o contador lê "Proposta aceita · Atendimento #… aberto.", sem pagamento no banco', async () => {
    const id = await oportunidadeAberta(contas.clienteC, contas.autonomo)
    const enviada = await comSessao(contas.autonomo.token, () =>
      enviarProposta({ oportunidadeId: id, mensagem: 'Contabilidade mensal com pagamento direto a mim.', valor: '1.200,00', natureza: 'recorrente' }),
    )
    if (!enviada.sucesso) throw new Error(enviada.mensagem)
    const [proposta] = await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, id))
    expect((await comSessao(contas.clienteC.token, () => aceitarProposta({ propostaId: proposta.id }))).sucesso).toBe(true)

    const item = await oportunidadeDoPrestador(contas.autonomo, id)
    expect(item.minhaProposta?.status).toBe('aceita')
    expect(item.pagoEm).toBeNull()
    expect(item.atendimento?.protocolo).toBeTruthy()
    const lida = situacao(item)
    expect(lida).toEqual({ tipo: 'proposta_aceita', texto: `Proposta aceita · Atendimento ${item.atendimento!.protocolo} aberto.` })
    expect(lida.texto).not.toContain('Pagamento')

    expect(await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))).toHaveLength(0)
    expect(await db.select().from(cobrancasPix).where(eq(cobrancasPix.referenciaId, id))).toHaveLength(0)
  })

  it('recorrente fechada por contraproposta: a resposta ao contador não fala em aguardar pagamento', async () => {
    const id = await oportunidadeAberta(contas.clienteC, contas.autonomo)
    const enviada = await comSessao(contas.autonomo.token, () =>
      enviarProposta({ oportunidadeId: id, mensagem: 'Contabilidade mensal com pagamento direto a mim.', valor: '1.500,00', natureza: 'recorrente' }),
    )
    if (!enviada.sucesso) throw new Error(enviada.mensagem)
    const [proposta] = await db.select().from(oportunidadePropostas).where(eq(oportunidadePropostas.oportunidadeId, id))
    const contra = await comSessao(contas.clienteC.token, () => criarContraproposta({ propostaId: proposta.id, valor: '1.200,00' }))
    if (!contra.sucesso) throw new Error(contra.mensagem)
    const [pendente] = await db
      .select({ id: oportunidadeContrapropostas.id })
      .from(oportunidadeContrapropostas)
      .where(eq(oportunidadeContrapropostas.propostaId, proposta.id))
    const resposta = await comSessao(contas.autonomo.token, () =>
      responderContraproposta({ contrapropostaId: pendente.id, decisao: 'aceitar' }),
    )
    expect(resposta.sucesso).toBe(true)
    expect(resposta.mensagem).not.toContain('aguarda o pagamento')
    expect(resposta.mensagem).toContain('atendimento foi aberto')

    const item = await oportunidadeDoPrestador(contas.autonomo, id)
    expect(situacao(item).tipo).toBe('proposta_aceita')
    expect(await db.select().from(oportunidadePagamentos).where(eq(oportunidadePagamentos.oportunidadeId, id))).toHaveLength(0)
  })

  it('avulsa paga pela Vincis continua "Pagamento aprovado · Atendimento #… aberto."', async () => {
    const id = await acordoAceito(contas.clienteA, contas.vendedor, 50_000)
    const emitida = await comSessao(contas.clienteA.token, () => iniciarPagamentoDoAcordo({ oportunidadeId: id }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    efiDeTeste.pagar(await txidDe(emitida.cobranca.id))
    expect((await comSessao(contas.clienteA.token, () => acompanharPagamentoDoAcordo({ oportunidadeId: id }))).situacao).toBe('pago')

    const item = await oportunidadeDoPrestador(contas.vendedor, id)
    expect(item.pagoEm).not.toBeNull()
    expect(situacao(item)).toEqual({
      tipo: 'pagamento_aprovado',
      texto: `Pagamento aprovado · Atendimento ${item.atendimento!.protocolo} aberto.`,
    })
  })
})
