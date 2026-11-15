import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contador parceiro responsável, comissão da Vincis nos avulsos e franquia do
 * contador Autônomo.
 *
 * - Plano contábil da Vincis: o cliente escolhe um contador parceiro
 *   (`modelo = vincis`) ou deixa a Vincis escolher; a Gestão aloca e troca, com
 *   histórico. Autônomo nunca é escolhível.
 * - Serviço avulso pago pela Vincis: comissão configurada pela Gestão, sem
 *   padrão no código, congelada na contratação; independente do parceiro.
 * - Autônomo: 1 GB gratuito somando as fontes privadas; +5 GB por R$ 9,90/mês.
 *
 * O upload de arquivo de Atendimento é simulado (sem storage), como na suíte
 * do Perfil Pro: o tamanho chega ao banco do mesmo jeito.
 */
vi.mock('@/features/atendimentos/lib/arquivo-atendimento', async (original) => {
  const real = await original<typeof import('@/features/atendimentos/lib/arquivo-atendimento')>()
  return {
    ...real,
    enviarArquivoAtendimento: async (atendimentoId: string, arquivo: File) => {
      real.validarArquivoAtendimento(arquivo)
      return {
        chave: `atendimentos/${atendimentoId}/arquivos/${crypto.randomUUID()}-${arquivo.name}`,
        nome: arquivo.name,
        tipoMime: arquivo.type,
        tamanhoBytes: arquivo.size,
      }
    },
  }
})

const { and, eq, inArray, or, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturaContadorAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  atendimentoArquivos,
  atendimentoConvites,
  cobrancasPix,
  colaboracoesCliente,
  configuracoesPlataforma,
  contratacoesServico,
  convitesEmpresa,
  eventosAuditoria,
  oportunidadeArquivos,
  oportunidades,
  perfisProfissionais,
  servicos,
} = await import('@/db/schema')
const { anexarArquivoAoAtendimento } = await import('@/features/atendimentos/actions/anexar-arquivo')
const { enviarMensagemAtendimento } = await import('@/features/atendimentos/actions/operacao')
const { alocarContadorResponsavel } = await import('@/features/assinaturas/actions/alocar-contador')
const { contratarPlanoVincis } = await import('@/features/assinaturas/actions/contratar-plano')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { listarPlanosGestao } = await import('@/features/assinaturas/queries/listar-planos-gestao')
const { contratarBlocoDeArmazenamento, obterMinhaFranquia } = await import(
  '@/features/franquia-armazenamento/actions/franquia'
)
const { CHAVE_FRANQUIA_AUTONOMO } = await import('@/features/franquia-armazenamento/constants/franquia')
const { exigirFranquiaDoAutonomo, franquiaDoAutonomo, usoDoAutonomo } = await import(
  '@/features/franquia-armazenamento/lib/franquia'
)
const { sincronizarCobranca } = await import('@/features/pagamentos/lib/cobrancas')
const { respostasIniciais } = await import('@/features/precificacao/lib/respostas')
const { obterTabelaDaVitrine } = await import('@/features/precificacao/queries/obter-tabela-precificacao')
const { listarContadoresParceiros } = await import('@/features/profissionais/queries/contadores-parceiros')
const { definirComissaoServicosAvulsos } = await import('@/features/servicos/actions/comissao')
const { iniciarPagamentoDoServico } = await import('@/features/servicos/actions/contratar')
const { CHAVE_COMISSAO_SERVICOS_AVULSOS, MENSAGEM_COMISSAO_PENDENTE } = await import(
  '@/features/servicos/constants/comissao'
)
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { contratarServico } = await import('./setup/contratar-servico')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { COMISSAO_DE_TESTE_MILESIMOS } = await import('./setup/global')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@alocacao-contador.teste'
const GB = 1024 ** 3
type Chave = 'parceiroA' | 'parceiroB' | 'autonomo' | 'semModelo' | 'advogado' | 'cliente' | 'outroCliente' | 'gestor'
let contas: Record<Chave, Conta>
let respostas: Awaited<ReturnType<typeof respostasIniciais>>
let periodoMensal: string

function arquivo(nome = 'balancete.pdf', bytes = 1024) {
  return new File([new Uint8Array(bytes)], nome, { type: 'application/pdf' })
}

function formulario(atendimentoId: string, f = arquivo()) {
  const dados = new FormData()
  dados.set('atendimentoId', atendimentoId)
  dados.set('arquivo', f)
  return dados
}

async function definirConfiguracao(chave: string, valor: string | null) {
  if (valor === null) {
    await db.delete(configuracoesPlataforma).where(eq(configuracoesPlataforma.chave, chave))
    return
  }
  // Sem autor: a conta do Gestor de teste é apagada ao fim.
  await db
    .insert(configuracoesPlataforma)
    .values({ chave, valor })
    .onConflictDoUpdate({ target: configuracoesPlataforma.chave, set: { valor, atualizadoPor: null } })
}

function contratarPlano(cliente: Conta, contador: unknown) {
  return comSessao(cliente.token, () =>
    contratarPlanoVincis({ planoCodigo: 'padrao', periodoCodigo: periodoMensal, respostas, contador }),
  )
}

function alocar(conta: Conta, assinaturaId: string, contadorId: string, motivo?: string) {
  return comSessao(conta.token, () => alocarContadorResponsavel({ assinaturaId, contadorId, motivo }))
}

async function assinatura(id: string) {
  const [linha] = await db.select().from(assinaturas).where(eq(assinaturas.id, id))
  return linha
}

async function historico(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaContadorAlocacoes)
    .where(eq(assinaturaContadorAlocacoes.assinaturaId, assinaturaId))
    .orderBy(assinaturaContadorAlocacoes.createdAt)
}

async function pagarPlano(conta: Conta, assinaturaId: string) {
  const emitida = await comSessao(conta.token, () => iniciarPagamentoDoPlano({ assinaturaId }))
  if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
  const [linha] = await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, emitida.cobranca.id))
  efiDeTeste.pagar(linha.txid)
  const pago = await comSessao(conta.token, () => acompanharPagamentoDoPlano({ assinaturaId }))
  return { cobrancaId: emitida.cobranca.id, valor: emitida.cobranca.valorCentavos, situacao: pago.situacao }
}

async function pagamentosConfirmados(assinaturaId: string) {
  const linhas = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from assinatura_pagamentos where assinatura_id = ${assinaturaId} and status = 'confirmado'`,
  )
  return Number(linhas[0]?.total ?? 0)
}

async function servicoDe(prestador: Conta, valorCentavos: number) {
  const [servico] = await db
    .insert(servicos)
    .values({
      prestadorId: prestador.id,
      nome: `Serviço avulso ${crypto.randomUUID().slice(0, 6)}`,
      descricaoCurta: 'Serviço avulso de teste.',
      modeloPreco: 'fixo',
      valorCentavos,
    })
    .returning({ id: servicos.id })
  return servico.id
}

/** Período das competências recua: o mês pago passa a ter terminado. */
async function recuarCompetencias(assinaturaIds: string[]) {
  await db
    .update(assinaturaCompetencias)
    .set({
      periodoInicio: sql`${assinaturaCompetencias.periodoInicio} - interval '3 years'`,
      periodoFim: sql`${assinaturaCompetencias.periodoFim} - interval '3 years'`,
    })
    .where(inArray(assinaturaCompetencias.assinaturaId, assinaturaIds))
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      parceiroA: { perfil: 'profissional', prestador: 'profissional' },
      parceiroB: { perfil: 'profissional', prestador: 'profissional' },
      autonomo: { perfil: 'profissional', prestador: 'profissional' },
      semModelo: { perfil: 'profissional', prestador: 'profissional' },
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119476',
  )
  for (const [chave, modelo] of [
    ['parceiroA', 'vincis'],
    ['parceiroB', 'vincis'],
    ['autonomo', 'autonomo'],
  ] as const) {
    await db
      .update(perfisProfissionais)
      .set({ tipoProfissional: 'contabilidade', modeloContratacao: modelo })
      .where(eq(perfisProfissionais.usuarioId, contas[chave].id))
  }
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia' })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))

  const tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  const padrao = tabela.servicos.find((s) => s.codigo === 'padrao')
  if (!padrao) throw new Error('Plano padrão ausente na vitrine de teste.')
  const { calcularPreco } = await import('@/features/precificacao/lib/motor')
  periodoMensal = calcularPreco(tabela, 'padrao', respostas).periodos.find((p) => p.meses === 1)!.periodo
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  sairDaSessao()
  await definirConfiguracao(CHAVE_FRANQUIA_AUTONOMO, String(GB))
  await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
  const ids = Object.values(contas).map((c) => c.id)
  const lista = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.usuarioId, ids), inArray(eventosAuditoria.autorId, ids)))
  await db.execute(sql`delete from assinatura_contador_alocacoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await db.execute(sql`delete from assinatura_pagamento_alocacoes where pagamento_id in (select p.id from assinatura_pagamentos p join assinaturas a on a.id = p.assinatura_id where a.cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamentos where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_competencias where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from parceiro_atribuicoes where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinaturas where cliente_usuario_id in (${lista})`)
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  await limparContas(SUFIXO)
})

describe('contador parceiro responsável — escolha do cliente', () => {
  it('só contadores "Contratação pela Vincis" aptos são escolhíveis; Autônomo, não definido e advogado ficam de fora', async () => {
    const elegiveis = (await listarContadoresParceiros()).map((c) => c.id)
    expect(elegiveis).toEqual(expect.arrayContaining([contas.parceiroA.id, contas.parceiroB.id]))
    expect(elegiveis).not.toContain(contas.autonomo.id)
    expect(elegiveis).not.toContain(contas.semModelo.id)
    expect(elegiveis).not.toContain(contas.advogado.id)
  })

  it('cliente escolhe o contador parceiro: ele nasce responsável, com histórico de origem "cliente"', async () => {
    const r = await contratarPlano(contas.cliente, { escolha: 'cliente', contadorId: contas.parceiroA.id })
    if (!r.sucesso) throw new Error(r.mensagem)
    const linha = await assinatura(r.dados!.assinaturaId)
    expect(linha.prestadorId).toBe(contas.parceiroA.id)
    expect(linha.escolhaContador).toBe('cliente')
    const eventos = await historico(linha.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ contadorAnteriorId: null, contadorNovoId: contas.parceiroA.id, origem: 'cliente', alteradoPorId: contas.cliente.id })
  })

  it('Autônomo não pode ser escolhido nem chamando a action direto; escolha é obrigatória', async () => {
    const antes = await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.clienteUsuarioId, contas.outroCliente.id))
    const autonomo = await contratarPlano(contas.outroCliente, { escolha: 'cliente', contadorId: contas.autonomo.id })
    expect(autonomo.sucesso).toBe(false)
    const semEscolha = await comSessao(contas.outroCliente.token, () =>
      contratarPlanoVincis({ planoCodigo: 'padrao', periodoCodigo: periodoMensal, respostas }),
    )
    expect(semEscolha.sucesso).toBe(false)
    const depois = await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.clienteUsuarioId, contas.outroCliente.id))
    expect(depois).toHaveLength(antes.length)
  })

  it('cliente deixa a Vincis escolher: sem responsável provisório, aparece como aguardando alocação', async () => {
    const r = await contratarPlano(contas.outroCliente, { escolha: 'vincis' })
    if (!r.sucesso) throw new Error(r.mensagem)
    const linha = await assinatura(r.dados!.assinaturaId)
    expect(linha.prestadorId).toBeNull()
    expect(linha.escolhaContador).toBe('vincis')
    expect(await historico(linha.id)).toHaveLength(0)
    const fila = await listarPlanosGestao({ filtro: 'aguardando_alocacao' })
    expect(fila.planos.map((p) => p.id)).toContain(linha.id)
    expect(fila.planos.find((p) => p.id === linha.id)?.contador).toBeNull()
  })
})

describe('contador parceiro responsável — Gestão', () => {
  let planoId: string

  beforeAll(async () => {
    const [linha] = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(and(eq(assinaturas.clienteUsuarioId, contas.outroCliente.id), eq(assinaturas.escolhaContador, 'vincis')))
    planoId = linha.id
  })

  it('só o Gestor aloca; Autônomo e não definido são recusados', async () => {
    expect((await alocar(contas.cliente, planoId, contas.parceiroA.id)).sucesso).toBe(false)
    expect((await alocar(contas.parceiroA, planoId, contas.parceiroA.id)).sucesso).toBe(false)
    expect((await alocar(contas.gestor, planoId, contas.autonomo.id)).sucesso).toBe(false)
    expect((await alocar(contas.gestor, planoId, contas.semModelo.id)).sucesso).toBe(false)
    expect((await assinatura(planoId)).prestadorId).toBeNull()
  })

  it('Gestor aloca o contador depois; o plano sai da fila', async () => {
    const r = await alocar(contas.gestor, planoId, contas.parceiroA.id)
    expect(r.sucesso).toBe(true)
    expect((await assinatura(planoId)).prestadorId).toBe(contas.parceiroA.id)
    const fila = await listarPlanosGestao({ filtro: 'aguardando_alocacao' })
    expect(fila.planos.map((p) => p.id)).not.toContain(planoId)
  })

  it('troca de contador preserva cliente, plano, valores, pagamentos e histórico; registra anterior, novo, gestor e motivo', async () => {
    // Plano pago antes da troca: o pagamento é da conta do cliente com a Vincis.
    const pago = await pagarPlano(contas.outroCliente, planoId)
    expect(pago.situacao).toBe('pago')
    const [cobranca] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, pago.cobrancaId))
    expect(cobranca.prestadorId).toBeNull()

    const antes = await assinatura(planoId)
    const competenciasAntes = await db.select().from(assinaturaCompetencias).where(eq(assinaturaCompetencias.assinaturaId, planoId))
    const pagamentosAntes = await db.select().from(assinaturaPagamentos).where(eq(assinaturaPagamentos.assinaturaId, planoId))
    const cobrancasAntes = await db.select().from(cobrancasPix).where(eq(cobrancasPix.clienteUsuarioId, contas.outroCliente.id))
    const historicoAntes = await historico(planoId)

    const r = await alocar(contas.gestor, planoId, contas.parceiroB.id, 'Redistribuição de carteira.')
    expect(r).toMatchObject({ sucesso: true, mensagem: 'Contador responsável trocado.' })

    const depois = await assinatura(planoId)
    expect(depois.prestadorId).toBe(contas.parceiroB.id)
    const { prestadorId: _a, updatedAt: _b, ...restoAntes } = antes
    const { prestadorId: _c, updatedAt: _d, ...restoDepois } = depois
    expect(restoDepois).toEqual(restoAntes)
    expect(await db.select().from(assinaturaCompetencias).where(eq(assinaturaCompetencias.assinaturaId, planoId))).toEqual(competenciasAntes)
    expect(await db.select().from(assinaturaPagamentos).where(eq(assinaturaPagamentos.assinaturaId, planoId))).toEqual(pagamentosAntes)
    expect(await db.select().from(cobrancasPix).where(eq(cobrancasPix.clienteUsuarioId, contas.outroCliente.id))).toEqual(cobrancasAntes)

    const eventos = await historico(planoId)
    expect(eventos).toHaveLength(historicoAntes.length + 1)
    // O histórico anterior não é reescrito.
    expect(eventos.slice(0, historicoAntes.length)).toEqual(historicoAntes)
    expect(eventos.at(-1)).toMatchObject({
      contadorAnteriorId: contas.parceiroA.id,
      contadorNovoId: contas.parceiroB.id,
      origem: 'gestor',
      alteradoPorId: contas.gestor.id,
      motivo: 'Redistribuição de carteira.',
    })

    const [auditoria] = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.acao, 'contador_responsavel_alterado'), eq(eventosAuditoria.registroAfetado, planoId)))
      .orderBy(sql`${eventosAuditoria.createdAt} desc`)
      .limit(1)
    expect(auditoria.autorId).toBe(contas.gestor.id)
    expect(auditoria.metadados).toMatchObject({ anterior: contas.parceiroA.id, novo: contas.parceiroB.id, motivo: 'Redistribuição de carteira.' })

    // Na tela da Gestão: atual + histórico, com quem decidiu.
    const lista = await listarPlanosGestao()
    const plano = lista.planos.find((p) => p.id === planoId)!
    expect(plano.contador?.id).toBe(contas.parceiroB.id)
    expect(plano.historico[0]).toMatchObject({ origem: 'gestor', motivo: 'Redistribuição de carteira.' })
  })

  it('alocação não usa convites de colaboração (semântica diferente)', async () => {
    const envolvidos = [contas.parceiroA.id, contas.parceiroB.id, contas.outroCliente.id]
    expect(await db.select().from(atendimentoConvites).where(inArray(atendimentoConvites.destinatarioId, envolvidos))).toHaveLength(0)
    expect(await db.select().from(colaboracoesCliente).where(inArray(colaboracoesCliente.destinatarioId, envolvidos))).toHaveLength(0)
    expect(await db.select().from(convitesEmpresa).where(inArray(convitesEmpresa.destinatarioId, envolvidos))).toHaveLength(0)
  })

  it('Autônomo segue sem Pix recorrente da Vincis: nunca é responsável de plano', async () => {
    const comAutonomo = await db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.prestadorId, contas.autonomo.id))
    expect(comAutonomo).toHaveLength(0)
    const cobrancas = await db
      .select({ id: cobrancasPix.id })
      .from(cobrancasPix)
      .where(and(eq(cobrancasPix.prestadorId, contas.autonomo.id), eq(cobrancasPix.finalidade, 'assinatura')))
    expect(cobrancas).toHaveLength(0)
  })
})

describe('comissão da Vincis nos serviços avulsos', () => {
  it('sem comissão configurada, o serviço avulso (inclusive do Autônomo) não é cobrado', async () => {
    await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, null)
    try {
      const servicoId = await servicoDe(contas.autonomo, 20_000)
      efiDeTeste.limpar()
      const r = await comSessao(contas.cliente.token, () => iniciarPagamentoDoServico({ servicoId }))
      expect(r).toMatchObject({ situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE })
      expect(efiDeTeste.emissoes).toBe(0)
      expect(await db.select().from(cobrancasPix).where(eq(cobrancasPix.referenciaId, servicoId))).toHaveLength(0)
    } finally {
      await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
    }
  })

  it('serviço avulso do Autônomo pago pela Vincis guarda o retrato da comissão; mudança posterior não reescreve', async () => {
    const servicoId = await servicoDe(contas.autonomo, 10_000)
    const contratado = await comSessao(contas.cliente.token, () => contratarServico({ servicoId }))
    if (!contratado.sucesso) throw new Error(contratado.mensagem)
    const ler = async () =>
      (await db.select().from(contratacoesServico).where(eq(contratacoesServico.id, contratado.dados!.contratacaoId)))[0]
    expect(await ler()).toMatchObject({
      valorSnapshotCentavos: 10_000,
      comissaoVincisMilesimos: 150,
      comissaoVincisCentavos: 1_500,
      valorProfissionalCentavos: 8_500,
    })

    // Só a Gestão altera; a mudança fica auditada com antes e depois.
    expect((await comSessao(contas.autonomo.token, () => definirComissaoServicosAvulsos({ percentual: '5' }))).sucesso).toBe(false)
    const alterada = await comSessao(contas.gestor.token, () => definirComissaoServicosAvulsos({ percentual: '20' }))
    expect(alterada.sucesso).toBe(true)
    try {
      expect(await ler()).toMatchObject({ comissaoVincisMilesimos: 150, comissaoVincisCentavos: 1_500 })
      const [auditoria] = await db
        .select()
        .from(eventosAuditoria)
        .where(and(eq(eventosAuditoria.acao, 'comissao_servicos_avulsos_alterada'), eq(eventosAuditoria.autorId, contas.gestor.id)))
      expect(auditoria.metadados).toMatchObject({ anteriorMilesimos: 150, novoMilesimos: 200 })

      // A próxima contratação usa o percentual novo.
      const outro = await servicoDe(contas.autonomo, 10_000)
      const segunda = await comSessao(contas.cliente.token, () => contratarServico({ servicoId: outro }))
      if (!segunda.sucesso) throw new Error(segunda.mensagem)
      const [linha] = await db.select().from(contratacoesServico).where(eq(contratacoesServico.id, segunda.dados!.contratacaoId))
      expect(linha).toMatchObject({ comissaoVincisMilesimos: 200, comissaoVincisCentavos: 2_000, valorProfissionalCentavos: 8_000 })
    } finally {
      await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
    }
  })

  it('percentual inválido ou zero é recusado: sempre há comissão', async () => {
    for (const percentual of ['0', '100', 'abc', '12,55']) {
      expect((await comSessao(contas.gestor.token, () => definirComissaoServicosAvulsos({ percentual }))).sucesso).toBe(false)
    }
  })

  it('comissão da Vincis e comissão do parceiro indicador são independentes', async () => {
    const fotografar = async () =>
      JSON.stringify([
        await db.execute(sql`select t::text from parceiro_nivel_configuracoes t order by 1`),
        await db.execute(sql`select t::text from parceiro_nivel_regras t order by 1`),
      ])
    const antes = await fotografar()
    const r = await comSessao(contas.gestor.token, () => definirComissaoServicosAvulsos({ percentual: '12,5' }))
    try {
      expect(r.sucesso).toBe(true)
      // Mexer na comissão da Vincis não toca a configuração de níveis do parceiro…
      expect(await fotografar()).toBe(antes)
      const [config] = await db
        .select({ valor: configuracoesPlataforma.valor })
        .from(configuracoesPlataforma)
        .where(eq(configuracoesPlataforma.chave, CHAVE_COMISSAO_SERVICOS_AVULSOS))
      expect(config.valor).toBe('125')
      // …e a chave é só dela: nenhuma configuração do Programa de Parceiros a compartilha.
      expect(CHAVE_COMISSAO_SERVICOS_AVULSOS.startsWith('parceiro')).toBe(false)
    } finally {
      await definirConfiguracao(CHAVE_COMISSAO_SERVICOS_AVULSOS, String(COMISSAO_DE_TESTE_MILESIMOS))
    }
  })
})

describe('franquia de armazenamento do Autônomo', () => {
  let atendimentoId: string

  beforeAll(async () => {
    const servicoId = await servicoDe(contas.autonomo, 5_000)
    const contratado = await comSessao(contas.cliente.token, () => contratarServico({ servicoId }))
    if (!contratado.sucesso) throw new Error(contratado.mensagem)
    atendimentoId = contratado.dados!.atendimentoId
  })

  it('Autônomo recebe 1 GB gratuito; contador da Vincis não tem franquia', async () => {
    const franquia = await franquiaDoAutonomo(db, contas.autonomo.id)
    expect(franquia).toMatchObject({ franquiaBytes: GB, blocosExtras: 0, limiteBytes: GB, esgotado: false })
    expect((await comSessao(contas.autonomo.token, () => obterMinhaFranquia())).dados?.limiteBytes).toBe(GB)
    expect((await comSessao(contas.parceiroA.token, () => obterMinhaFranquia())).dados).toBeNull()
    // Contador "Contratação pela Vincis" não esbarra em limite nenhum.
    await expect(exigirFranquiaDoAutonomo(db, contas.parceiroA.id, 50 * GB)).resolves.toBeUndefined()
  })

  it('arquivos do Atendimento e anexos de pedido de orçamento consomem a mesma franquia', async () => {
    const inicial = await usoDoAutonomo(db, contas.autonomo.id)
    const envio = await comSessao(contas.cliente.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId, arquivo('nota.pdf', 2_000))))
    expect(envio.sucesso).toBe(true)
    expect(await usoDoAutonomo(db, contas.autonomo.id)).toBe(inicial + 2_000)

    const [pedido] = await db
      .insert(oportunidades)
      .values({
        clienteUsuarioId: contas.cliente.id,
        categoria: 'contabilidade',
        titulo: 'Abertura de empresa',
        descricao: 'Preciso abrir uma empresa de serviços e entender o regime tributário.',
        visibilidade: 'privada',
        destinatarioId: contas.autonomo.id,
        expiraEm: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning({ id: oportunidades.id })
    await db.insert(oportunidadeArquivos).values({
      oportunidadeId: pedido.id,
      nome: 'contrato-social.pdf',
      tipoMime: 'application/pdf',
      tamanhoBytes: 3_000,
      remetenteId: contas.cliente.id,
      chave: `oportunidades/${pedido.id}/contrato-social.pdf`,
    })
    expect(await usoDoAutonomo(db, contas.autonomo.id)).toBe(inicial + 5_000)
  })

  it('no limite, só NOVOS uploads são bloqueados: arquivos guardados e mensagens de texto seguem', async () => {
    const uso = await usoDoAutonomo(db, contas.autonomo.id)
    await definirConfiguracao(CHAVE_FRANQUIA_AUTONOMO, String(uso + 100))
    const guardados = await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimentoId))

    const doCliente = await comSessao(contas.cliente.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))
    const doAutonomo = await comSessao(contas.autonomo.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))
    expect(doCliente.sucesso).toBe(false)
    expect(doAutonomo.sucesso).toBe(false)
    expect(await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimentoId))).toEqual(guardados)

    const texto = await comSessao(contas.cliente.token, () =>
      enviarMensagemAtendimento({ atendimentoId, escopo: 'cliente', conteudo: 'Mensagem de texto continua liberada.' }),
    )
    expect(texto.sucesso).toBe(true)
    const situacao = await comSessao(contas.autonomo.token, () => obterMinhaFranquia())
    expect(situacao.dados?.esgotado).toBe(false)
    // Pequeno arquivo que cabe no que sobrou ainda entra.
    expect((await comSessao(contas.autonomo.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId, arquivo('ok.pdf', 100))))).sucesso).toBe(true)
    expect((await franquiaDoAutonomo(db, contas.autonomo.id)).esgotado).toBe(true)
  })

  it('+5 GB custa R$ 9,90/mês; clique duplo devolve o mesmo; só o Autônomo contrata', async () => {
    expect((await comSessao(contas.parceiroA.token, () => contratarBlocoDeArmazenamento())).sucesso).toBe(false)
    const [a, b] = await Promise.all([
      comSessao(contas.autonomo.token, () => contratarBlocoDeArmazenamento()),
      comSessao(contas.autonomo.token, () => contratarBlocoDeArmazenamento()),
    ])
    if (!a.sucesso || !b.sucesso) throw new Error('contratação recusada')
    expect(a.dados.assinaturaId).toBe(b.dados.assinaturaId)
    const linha = await assinatura(a.dados.assinaturaId)
    expect(linha).toMatchObject({ planoCodigo: 'autonomo_armazenamento', valorTotalCentavos: 990, meses: 1, status: 'aguardando_pagamento', prestadorId: null })
    // Antes do Pix confirmado nada muda.
    expect((await franquiaDoAutonomo(db, contas.autonomo.id)).blocosExtras).toBe(0)
  })

  it('pagamento confirmado soma exatamente +5 GB; confirmação repetida não duplica', async () => {
    const pendente = await comSessao(contas.autonomo.token, () => contratarBlocoDeArmazenamento())
    if (!pendente.sucesso) throw new Error(pendente.mensagem)
    const antes = await franquiaDoAutonomo(db, contas.autonomo.id)
    const pago = await pagarPlano(contas.autonomo, pendente.dados.assinaturaId)
    expect(pago).toMatchObject({ valor: 990, situacao: 'pago' })
    await sincronizarCobranca(pago.cobrancaId, { forcar: true })
    await sincronizarCobranca(pago.cobrancaId, { forcar: true })
    expect(await pagamentosConfirmados(pendente.dados.assinaturaId)).toBe(1)

    const depois = await franquiaDoAutonomo(db, contas.autonomo.id)
    expect(depois.blocosExtras).toBe(1)
    expect(depois.limiteBytes).toBe(antes.limiteBytes! + 5 * GB)
    expect(depois.esgotado).toBe(false)
    expect((await comSessao(contas.autonomo.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))).sucesso).toBe(true)

    // Com a franquia real de 1 GB: 1 GB + 5 GB = 6 GB.
    await definirConfiguracao(CHAVE_FRANQUIA_AUTONOMO, String(GB))
    expect((await franquiaDoAutonomo(db, contas.autonomo.id)).limiteBytes).toBe(6 * GB)
  })

  it('bloco vencido deixa de contar e não apaga arquivos; só novos uploads voltam a ser bloqueados', async () => {
    const blocos = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(and(eq(assinaturas.clienteUsuarioId, contas.autonomo.id), eq(assinaturas.planoCodigo, 'autonomo_armazenamento')))
    const uso = await usoDoAutonomo(db, contas.autonomo.id)
    await definirConfiguracao(CHAVE_FRANQUIA_AUTONOMO, String(uso))
    await recuarCompetencias(blocos.map((b) => b.id))

    const guardados = await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimentoId))
    const franquia = await franquiaDoAutonomo(db, contas.autonomo.id)
    expect(franquia.blocosExtras).toBe(0)
    expect(franquia.esgotado).toBe(true)
    expect(await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimentoId))).toEqual(guardados)
    expect((await comSessao(contas.autonomo.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))).sucesso).toBe(false)
  })
})
