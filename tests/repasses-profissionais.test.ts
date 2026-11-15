import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Divisão Vincis × profissional (25% / 75%) e repasse manual.
 *
 * Fluxos reais (contratação, Pix da Efí de teste, confirmação, prestação,
 * cancelamento); o atendimento é concluído direto no banco porque aqui só
 * importa o estado que libera o repasse.
 */
const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturaPagamentos,
  assinaturas,
  atendimentos,
  cobrancasPix,
  configuracoesPlataforma,
  contratacoesServico,
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroIndicacoes,
  parceiros,
  perfisProfissionais,
  repassesProfissionais,
  servicos,
} = await import('@/db/schema')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { cancelarPlano } = await import('@/features/assinaturas/lib/cancelamento')
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { registrarRepasseProfissional } = await import('@/features/repasses/actions/repasses')
const { decidirSituacao, dividirAlocacoes, liquidoDaVincis } = await import('@/features/repasses/lib/regras')
const { sincronizarRepasses } = await import('@/features/repasses/lib/sincronizar-repasses')
const { listarRepassesGestao } = await import('@/features/repasses/queries/listar-repasses')
const { CHAVE_COMISSAO_SERVICOS_AVULSOS } = await import('@/features/servicos/constants/comissao')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { contratarServico } = await import('./setup/contratar-servico')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@repasses.teste'
type Chave = 'contador' | 'cliente' | 'outroCliente' | 'gestor' | 'indicador'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodos: { mensal: string; semestral: string }
let comissaoAnterior: string | null = null
let semestral: string

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function definirComissao(milesimos: number) {
  await db
    .insert(configuracoesPlataforma)
    .values({ chave: CHAVE_COMISSAO_SERVICOS_AVULSOS, valor: String(milesimos) })
    .onConflictDoUpdate({ target: configuracoesPlataforma.chave, set: { valor: String(milesimos) } })
}

async function mes(assinaturaId: string, numero: number) {
  const [linha] = await db
    .select()
    .from(assinaturaCompetencias)
    .where(and(eq(assinaturaCompetencias.assinaturaId, assinaturaId), eq(assinaturaCompetencias.numero, numero)))
  return linha
}

async function repasseDe(origemId: string) {
  const [linha] = await db.select().from(repassesProfissionais).where(eq(repassesProfissionais.origemId, origemId))
  return linha
}

async function repassesDoPlano(assinaturaId: string) {
  return db
    .select()
    .from(repassesProfissionais)
    .where(eq(repassesProfissionais.assinaturaId, assinaturaId))
}

async function pagarPlano(cliente: Conta, assinaturaId: string) {
  const emitida = await comSessao(cliente.token, () => iniciarPagamentoDoPlano({ assinaturaId }))
  if (emitida.situacao !== 'cobranca') throw new Error(`Pix não emitido: ${emitida.situacao}`)
  const [cobranca] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
  efiDeTeste.pagar(cobranca.txid)
  const acompanhado = await comSessao(cliente.token, () => acompanharPagamentoDoPlano({ assinaturaId }))
  expect(acompanhado.situacao).toBe('pago')
  return cobranca
}

function registrar(conta: Conta, repasseId: string, comprovante = 'E2E-TESTE-0001') {
  return comSessao(conta.token, () =>
    registrarRepasseProfissional({ repasseId, repassadoEm: hoje(), comprovante, observacao: '' }),
  )
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      contador: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
      indicador: { perfil: 'cliente' },
    },
    '119777',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'contabilidade', modeloContratacao: 'vincis' })
    .where(eq(perfisProfissionais.usuarioId, contas.contador.id))

  const [atual] = await db
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_COMISSAO_SERVICOS_AVULSOS))
  comissaoAnterior = atual?.valor ?? null
  await definirComissao(250)

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
  await db.delete(repassesProfissionais).where(inArray(repassesProfissionais.clienteUsuarioId, ids))
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.usuarioId, ids), inArray(eventosAuditoria.autorId, ids)))
  await db.execute(sql`delete from parceiro_comissoes where cliente_usuario_id in (${lista})`)
  await db.execute(sql`delete from parceiro_nivel_historico where parceiro_id in (select id from parceiros where usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiro_nivel_estados where parceiro_id in (select id from parceiros where usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiro_atribuicoes where usuario_id in (${lista})`)
  await db.execute(sql`delete from parceiro_indicacoes where parceiro_id in (select id from parceiros where usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiros where usuario_id in (${lista})`)
  await db.execute(sql`delete from assinatura_contador_alocacoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamento_alocacoes where pagamento_id in (select p.id from assinatura_pagamentos p join assinaturas a on a.id = p.assinatura_id where a.cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamentos where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_competencias where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(contratacoesServico).where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.execute(sql`delete from assinaturas where cliente_usuario_id in (${lista})`)
  await db.execute(sql`delete from notificacoes where autor_id in (${lista}) or destinatario_id in (${lista})`)
  if (comissaoAnterior === null) {
    await db.delete(configuracoesPlataforma).where(eq(configuracoesPlataforma.chave, CHAVE_COMISSAO_SERVICOS_AVULSOS))
  } else {
    await definirComissao(Number(comissaoAnterior))
  }
  await limparContas(SUFIXO)
})

describe('A. regras puras', () => {
  it('25% arredonda a comissão e o profissional fecha o bruto em centavos', () => {
    const r = dividirAlocacoes([{ valorCentavos: 33_333, milesimos: 250 }])
    expect(r).toEqual({ tipo: 'ok', divisao: { milesimos: 250, comissaoCentavos: 8_333, profissionalCentavos: 25_000 } })
    for (const valor of [1, 3, 99, 101, 12_345, 49_990, 1_000_001]) {
      const d = dividirAlocacoes([{ valorCentavos: valor, milesimos: 250 }])
      if (d.tipo !== 'ok') throw new Error('esperava ok')
      expect(d.divisao.comissaoCentavos + d.divisao.profissionalCentavos).toBe(valor)
    }
  })

  it('várias alocações somam por alocação; sem retrato ou percentuais diferentes vão para revisão', () => {
    const r = dividirAlocacoes([
      { valorCentavos: 101, milesimos: 250 },
      { valorCentavos: 101, milesimos: 250 },
    ])
    expect(r).toEqual({ tipo: 'ok', divisao: { milesimos: 250, comissaoCentavos: 50, profissionalCentavos: 152 } })
    expect(dividirAlocacoes([{ valorCentavos: 100, milesimos: null }])).toEqual({ tipo: 'sem_retrato' })
    expect(dividirAlocacoes([])).toEqual({ tipo: 'sem_retrato' })
    expect(
      dividirAlocacoes([
        { valorCentavos: 100, milesimos: 250 },
        { valorCentavos: 100, milesimos: 300 },
      ]),
    ).toEqual({ tipo: 'divergente' })
  })

  it('o indicador sai só da parte da Vincis', () => {
    expect(liquidoDaVincis(2_500, 1_000)).toBe(1_500)
    expect(liquidoDaVincis(2_500, 3_000)).toBe(-500)
    expect(liquidoDaVincis(null, 100)).toBeNull()
  })

  it('decisão da situação segue a ordem estorno → interrupção → retrato → prestação', () => {
    const base = {
      estornado: false,
      divisao: 'ok' as const,
      prestacao: { tipo: 'concluida' as const },
      coberturaCompleta: true,
      profissionalId: 'p',
    }
    expect(decidirSituacao(base)).toEqual({ situacao: 'disponivel', motivoRevisao: null })
    expect(decidirSituacao({ ...base, estornado: true }).motivoRevisao).toBe('pagamento_estornado')
    expect(
      decidirSituacao({ ...base, prestacao: { tipo: 'interrompida', motivo: 'competencia_cancelada' } }).motivoRevisao,
    ).toBe('competencia_cancelada')
    expect(decidirSituacao({ ...base, divisao: 'sem_retrato' }).motivoRevisao).toBe('sem_percentual_registrado')
    expect(decidirSituacao({ ...base, prestacao: { tipo: 'pendente' } }).situacao).toBe('aguardando_liberacao')
    expect(decidirSituacao({ ...base, coberturaCompleta: false }).situacao).toBe('aguardando_liberacao')
    expect(decidirSituacao({ ...base, profissionalId: null }).motivoRevisao).toBe('sem_profissional')
  })
})

describe('B. plano semestral pago antecipadamente, com parceiro indicador', () => {
  it('Pix do plano congela 25% no retrato; cada mês nasce aguardando liberação, 25/75 exato', async () => {
    const r = await comSessao(contas.cliente.token, () =>
      contratarPlanoVincis({
        planoCodigo: 'padrao',
        periodoCodigo: periodos.semestral,
        respostas,
        contador: { escolha: 'cliente', contadorId: contas.contador.id },
      }),
    )
    if (!r.sucesso) throw new Error(r.mensagem)
    semestral = r.dados!.assinaturaId

    // Indicação do parceiro para esta assinatura (o caminho de link é testado
    // em parceiros-*.test.ts; aqui basta a atribuição existir).
    const [parceiro] = await db
      .insert(parceiros)
      .values({ usuarioId: contas.indicador.id, codigo: `rep${Date.now().toString(36)}`.slice(0, 16) })
      .returning({ id: parceiros.id })
    const [indicacao] = await db
      .insert(parceiroIndicacoes)
      .values({ parceiroId: parceiro.id, visitanteHash: `visitante-${crypto.randomUUID()}` })
      .returning({ id: parceiroIndicacoes.id })
    await db.insert(parceiroAtribuicoes).values({
      indicacaoId: indicacao.id,
      parceiroId: parceiro.id,
      usuarioId: contas.cliente.id,
      assinaturaId: semestral,
      resolvidaPor: 'conta',
    })

    const cobranca = await pagarPlano(contas.cliente, semestral)
    expect((cobranca.contexto as { comissaoVincis?: { milesimos: number } }).comissaoVincis?.milesimos).toBe(250)

    await sincronizarRepasses()
    const linhas = await repassesDoPlano(semestral)
    expect(linhas).toHaveLength(6)
    const [plano] = await db.select().from(assinaturas).where(eq(assinaturas.id, semestral))
    for (const linha of linhas) {
      expect(linha).toMatchObject({
        origem: 'competencia',
        situacao: 'aguardando_liberacao',
        profissionalId: contas.contador.id,
        comissaoVincisMilesimos: 250,
        valorBrutoCentavos: plano.valorMensalCentavos,
      })
      expect(linha.comissaoVincisCentavos! + linha.valorProfissionalCentavos!).toBe(linha.valorBrutoCentavos)
      expect(linha.comissaoVincisCentavos).toBe(Math.round((linha.valorBrutoCentavos * 250) / 1000))
    }
    // Nada liberado só por ter pago adiantado.
    expect(linhas.every((l) => l.liberadoEm === null)).toBe(true)
  })

  it('mês cumprido fica disponível; indicador é descontado só da parte da Vincis', async () => {
    const primeiro = await mes(semestral, 1)
    expect(await cumprirCompetencia({ competenciaId: primeiro.id })).toMatchObject({ ok: true })
    await sincronizarRepasses()

    const linha = await repasseDe(primeiro.id)
    expect(linha.situacao).toBe('disponivel')
    expect(linha.liberadoEm).not.toBeNull()
    const [comissao] = await db
      .select()
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.competenciaId, primeiro.id))
    expect(comissao).toBeDefined()
    expect(linha.comissaoIndicadorCentavos).toBe(comissao.valorCentavos)
    // O profissional continua com 75%, com ou sem indicador.
    expect(linha.valorProfissionalCentavos).toBe(linha.valorBrutoCentavos - linha.comissaoVincisCentavos!)

    const { repasses } = await listarRepassesGestao({ filtro: 'disponivel', pagina: 1 })
    const naTela = repasses.find((r) => r.id === linha.id)!
    expect(naTela.liquidoVincisCentavos).toBe(linha.comissaoVincisCentavos! - comissao.valorCentavos)

    const segundo = await repasseDe((await mes(semestral, 2)).id)
    expect(segundo.situacao).toBe('aguardando_liberacao')
  })

  it('somente o Gestor registra repasse; cliente e profissional são recusados', async () => {
    const linha = await repasseDe((await mes(semestral, 1)).id)
    for (const conta of [contas.cliente, contas.contador, contas.indicador]) {
      expect(await registrar(conta, linha.id)).toEqual({ sucesso: false, mensagem: 'Operação não autorizada.' })
    }
    expect((await repasseDe(linha.origemId)).situacao).toBe('disponivel')
  })

  it('valor aguardando liberação não pode ser repassado', async () => {
    const segundo = await repasseDe((await mes(semestral, 2)).id)
    const r = await registrar(contas.gestor, segundo.id)
    expect(r.sucesso).toBe(false)
    expect(r.mensagem).toContain('Aguardando liberação')
    expect((await repasseDe(segundo.origemId)).situacao).toBe('aguardando_liberacao')
  })

  it('Gestor registra o repasse uma vez, com auditoria; a segunda tentativa é recusada', async () => {
    const linha = await repasseDe((await mes(semestral, 1)).id)
    const r = await registrar(contas.gestor, linha.id, 'E2E123456789')
    expect(r.sucesso).toBe(true)

    const depois = await repasseDe(linha.origemId)
    expect(depois).toMatchObject({
      situacao: 'repassado',
      repassadoPorId: contas.gestor.id,
      comprovante: 'E2E123456789',
      valorProfissionalCentavos: linha.valorProfissionalCentavos,
    })
    const [evento] = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.acao, 'repasse_profissional_registrado'), eq(eventosAuditoria.registroAfetado, linha.id)))
    expect(evento).toMatchObject({ autorId: contas.gestor.id, usuarioId: contas.contador.id })

    expect(await registrar(contas.gestor, linha.id)).toEqual({
      sucesso: false,
      mensagem: 'Este repasse já foi registrado.',
    })
  })

  it('data futura e comprovante vazio são recusados no servidor', async () => {
    const linha = await repasseDe((await mes(semestral, 2)).id)
    const amanha = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const futuro = await comSessao(contas.gestor.token, () =>
      registrarRepasseProfissional({ repasseId: linha.id, repassadoEm: amanha, comprovante: 'E2E-FUTURO' }),
    )
    expect(futuro.sucesso).toBe(false)
    const vazio = await comSessao(contas.gestor.token, () =>
      registrarRepasseProfissional({ repasseId: linha.id, repassadoEm: hoje(), comprovante: '  ' }),
    )
    expect(vazio.sucesso).toBe(false)
  })

  it('mudar o percentual depois não recalcula o que já foi pago', async () => {
    const antes = await repassesDoPlano(semestral)
    await definirComissao(300)
    try {
      await sincronizarRepasses()
      const depois = await repassesDoPlano(semestral)
      for (const linha of depois) {
        const anterior = antes.find((a) => a.id === linha.id)!
        expect(linha.comissaoVincisMilesimos).toBe(250)
        expect(linha.valorProfissionalCentavos).toBe(anterior.valorProfissionalCentavos)
      }
    } finally {
      await definirComissao(250)
    }
  })

  it('cancelar o plano manda os meses futuros pagos para revisão; o repassado não muda', async () => {
    const repassado = await repasseDe((await mes(semestral, 1)).id)
    const cancelado = await cancelarPlano({
      assinaturaId: semestral,
      origem: 'gestor',
      autorId: contas.gestor.id,
      motivo: 'Teste de repasse com meses futuros pagos.',
    })
    expect(cancelado).toMatchObject({ jaEstavaCancelado: false, competenciasCanceladas: 5 })
    await sincronizarRepasses()

    const linhas = await repassesDoPlano(semestral)
    const futuros = []
    for (const linha of linhas) {
      const [competencia] = await db.select().from(assinaturaCompetencias).where(eq(assinaturaCompetencias.id, linha.origemId))
      if (competencia.status === 'cancelada') futuros.push(linha)
    }
    expect(futuros.length).toBeGreaterThan(0)
    for (const linha of futuros) {
      expect(linha).toMatchObject({ situacao: 'em_revisao', motivoRevisao: 'competencia_cancelada', repassadoEm: null })
    }
    expect(await repasseDe(repassado.origemId)).toMatchObject({
      situacao: 'repassado',
      comprovante: repassado.comprovante,
      updatedAt: repassado.updatedAt,
    })
  })
})

describe('C. estorno e pagamento sem retrato', () => {
  it('Pix sem retrato vai para revisão; estorno tem precedência', async () => {
    const r = await comSessao(contas.outroCliente.token, () =>
      contratarPlanoVincis({
        planoCodigo: 'padrao',
        periodoCodigo: periodos.mensal,
        respostas,
        contador: { escolha: 'cliente', contadorId: contas.contador.id },
      }),
    )
    if (!r.sucesso) throw new Error(r.mensagem)
    const id = r.dados!.assinaturaId
    const cobranca = await pagarPlano(contas.outroCliente, id)
    const primeiro = await mes(id, 1)

    await sincronizarRepasses()
    expect((await repasseDe(primeiro.id)).situacao).toBe('aguardando_liberacao')

    // Pix antigo, emitido antes do retrato: a Vincis não inventa o percentual.
    await db.update(cobrancasPix).set({ contexto: { competenciaNumero: 1 } }).where(eq(cobrancasPix.id, cobranca.id))
    await sincronizarRepasses()
    expect(await repasseDe(primeiro.id)).toMatchObject({
      situacao: 'em_revisao',
      motivoRevisao: 'sem_percentual_registrado',
      valorProfissionalCentavos: null,
    })

    await db
      .update(assinaturaPagamentos)
      .set({ status: 'estornado', estornadoEm: new Date() })
      .where(eq(assinaturaPagamentos.idExterno, cobranca.txid))
    await sincronizarRepasses()
    expect(await repasseDe(primeiro.id)).toMatchObject({ situacao: 'em_revisao', motivoRevisao: 'pagamento_estornado' })
  })
})

describe('D. serviço avulso pago por Pix', () => {
  let contratacaoId: string
  let atendimentoId: string

  it('pago e não concluído aguarda; concluído fica disponível com o retrato do Pix', async () => {
    const [servico] = await db
      .insert(servicos)
      .values({
        prestadorId: contas.contador.id,
        nome: 'Abertura de MEI',
        descricaoCurta: 'Formalização completa do MEI.',
        modeloPreco: 'fixo',
        valorCentavos: 33_333,
        prazoEstimadoDias: 5,
      })
      .returning({ id: servicos.id })
    const contratado = await comSessao(contas.outroCliente.token, () => contratarServico({ servicoId: servico.id }))
    if (!contratado.sucesso) throw new Error(contratado.mensagem)
    contratacaoId = contratado.dados.contratacaoId
    atendimentoId = contratado.dados.atendimentoId

    await sincronizarRepasses()
    expect(await repasseDe(contratacaoId)).toMatchObject({
      origem: 'servico',
      situacao: 'aguardando_liberacao',
      valorBrutoCentavos: 33_333,
      comissaoVincisMilesimos: 250,
      comissaoVincisCentavos: 8_333,
      valorProfissionalCentavos: 25_000,
      profissionalId: contas.contador.id,
    })

    await db.update(atendimentos).set({ status: 'concluido' }).where(eq(atendimentos.id, atendimentoId))
    await sincronizarRepasses()
    expect((await repasseDe(contratacaoId)).situacao).toBe('disponivel')
  })

  it('dois registros simultâneos: exatamente um repasse', async () => {
    const linha = await repasseDe(contratacaoId)
    const resultados = await Promise.all([
      registrar(contas.gestor, linha.id, 'E2E-CONCORRENTE-A'),
      registrar(contas.gestor, linha.id, 'E2E-CONCORRENTE-B'),
    ])
    expect(resultados.filter((r) => r.sucesso)).toHaveLength(1)
    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.acao, 'repasse_profissional_registrado'), eq(eventosAuditoria.registroAfetado, linha.id)))
    expect(eventos).toHaveLength(1)
  })

  it('repassado não volta atrás nem se o atendimento mudar depois', async () => {
    const antes = await repasseDe(contratacaoId)
    await db.update(atendimentos).set({ status: 'cancelado' }).where(eq(atendimentos.id, atendimentoId))
    await sincronizarRepasses()
    expect(await repasseDe(contratacaoId)).toMatchObject({ situacao: 'repassado', comprovante: antes.comprovante })
  })

  it('contratação cancelada antes do repasse vai para revisão', async () => {
    const [servico] = await db
      .insert(servicos)
      .values({
        prestadorId: contas.contador.id,
        nome: 'Declaração de IR',
        descricaoCurta: 'Declaração anual.',
        modeloPreco: 'fixo',
        valorCentavos: 20_000,
        prazoEstimadoDias: 5,
      })
      .returning({ id: servicos.id })
    const contratado = await comSessao(contas.cliente.token, () => contratarServico({ servicoId: servico.id }))
    if (!contratado.sucesso) throw new Error(contratado.mensagem)
    await db
      .update(contratacoesServico)
      .set({ status: 'cancelado' })
      .where(eq(contratacoesServico.id, contratado.dados.contratacaoId))
    await sincronizarRepasses()
    expect(await repasseDe(contratado.dados.contratacaoId)).toMatchObject({
      situacao: 'em_revisao',
      motivoRevisao: 'contratacao_cancelada',
    })
  })
})
