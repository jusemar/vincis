import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Perfil Essencial × Perfil Pro (advocacia).
 *
 * Prova, no servidor, que:
 * - Essencial não envia nem recebe documento pela Vincis (Atendimento e pedido
 *   de orçamento), mas conversa por texto;
 * - Pro só ativa depois do Pix confirmado e libera os documentos;
 * - Pro vencido volta a Essencial sem apagar nada;
 * - o limite de armazenamento, quando configurado, trava o envio novo;
 * - contador segue como sempre; a busca não muda de ordem.
 */

vi.mock('@/features/atendimentos/lib/arquivo-atendimento', async (original) => {
  const real = await original<typeof import('@/features/atendimentos/lib/arquivo-atendimento')>()
  return {
    ...real,
    enviarArquivoAtendimento: async (atendimentoId: string, arquivo: File) => {
      real.validarArquivoAtendimento(arquivo)
      return {
        chave: `atendimentos/${atendimentoId}/arquivos/${arquivo.name}`,
        nome: arquivo.name,
        tipoMime: arquivo.type,
        tamanhoBytes: arquivo.size,
      }
    },
  }
})

const { and, eq, inArray, sql } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  assinaturaCompetencias,
  assinaturas,
  atendimentoArquivos,
  atendimentos,
  cobrancasPix,
  configuracoesPlataforma,
  oportunidadeArquivos,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  servicos,
} = await import('@/db/schema')
const { anexarArquivoAoAtendimento } = await import('@/features/atendimentos/actions/anexar-arquivo')
const { enviarMensagemAtendimento } = await import('@/features/atendimentos/actions/operacao')
const { contratarServico } = await import('./setup/contratar-servico')
const { acompanharPagamentoDoPlano, iniciarPagamentoDoPlano } = await import(
  '@/features/assinaturas/actions/pagamento-plano'
)
const { aceitarProposta } = await import('@/features/oportunidades/actions/negociacao')
const { criarOportunidade } = await import('@/features/oportunidades/actions/oportunidades')
const { contratarArmazenamentoExtra, contratarPerfilPro, obterMeuPerfilPro } = await import(
  '@/features/perfil-pro/actions/perfil-pro'
)
const { sincronizarCobranca } = await import('@/features/pagamentos/lib/cobrancas')
const { CHAVE_LIMITE_ARMAZENAMENTO_PRO } = await import('@/features/perfil-pro/constants/perfil-pro')
const { adicionaisDeArmazenamentoVigentes, armazenamentoDoPrestador, situacaoDocumentos } = await import(
  '@/features/perfil-pro/lib/perfil-pro'
)
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { efiDeTeste } = await import('./setup/efi-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

type Conta = { id: string; token: string }
const SUFIXO = '@perfil-pro.teste'
let contas: Record<'advogado' | 'contador' | 'cliente', Conta>

function arquivo(nome = 'peticao.pdf', bytes = 1024) {
  return new File([new Uint8Array(bytes)], nome, { type: 'application/pdf' })
}

function formulario(atendimentoId: string, f = arquivo()) {
  const dados = new FormData()
  dados.set('atendimentoId', atendimentoId)
  dados.set('arquivo', f)
  return dados
}

/** Atendimento jurídico pelo caminho real: proposta privada aceita. */
async function atendimentoCom(prestador: Conta, categoria: string) {
  const [oportunidade] = await db
    .insert(oportunidades)
    .values({
      clienteUsuarioId: contas.cliente.id,
      categoria,
      titulo: 'Revisão de contrato',
      descricao: 'Preciso revisar um contrato de prestação de serviços com fornecedor.',
      visibilidade: 'privada',
      destinatarioId: prestador.id,
      expiraEm: new Date(Date.now() + 7 * 86_400_000),
    })
    .returning({ id: oportunidades.id })
  const [proposta] = await db
    .insert(oportunidadePropostas)
    .values({
      oportunidadeId: oportunidade.id,
      prestadorId: prestador.id,
      mensagem: 'Revisão completa com parecer.',
      valorCentavos: 80_000,
      status: 'enviada',
      validaAte: new Date(Date.now() + 3 * 86_400_000),
    })
    .returning({ id: oportunidadePropostas.id })
  if (categoria === 'advocacia') {
    const aceite = await comSessao(contas.cliente.token, () => aceitarProposta({ propostaId: proposta.id }))
    if (!aceite.sucesso) throw new Error(aceite.mensagem)
  }
  const [linha] = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(eq(atendimentos.oportunidadeId, oportunidade.id))
  return linha?.id ?? null
}

/** Contrata e paga o Pro pelo caminho real (Pix na Efí falsa). */
async function assinarPro(periodo: 'mensal' | 'seis_meses' | 'doze_meses' = 'mensal') {
  const contratada = await comSessao(contas.advogado.token, () => contratarPerfilPro({ periodo }))
  if (!contratada.sucesso) throw new Error(contratada.mensagem)
  const emitida = await comSessao(contas.advogado.token, () =>
    iniciarPagamentoDoPlano({ assinaturaId: contratada.dados.assinaturaId }),
  )
  if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
  return { assinaturaId: contratada.dados.assinaturaId, cobrancaId: emitida.cobranca.id, valor: emitida.cobranca.valorCentavos }
}

async function pagar(cobrancaId: string, assinaturaId: string) {
  const [linha] = await db.select({ txid: cobrancasPix.txid }).from(cobrancasPix).where(eq(cobrancasPix.id, cobrancaId))
  efiDeTeste.pagar(linha.txid)
  return comSessao(contas.advogado.token, () => acompanharPagamentoDoPlano({ assinaturaId }))
}

function assinaturasDoAdvogado() {
  return db.select({ id: assinaturas.id }).from(assinaturas).where(eq(assinaturas.clienteUsuarioId, contas.advogado.id))
}

async function pagamentosConfirmados(assinaturaId: string) {
  const linhas = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from assinatura_pagamentos where assinatura_id = ${assinaturaId} and status = 'confirmado'`,
  )
  return Number(linhas[0]?.total ?? 0)
}

async function definirIncluido(valor: string) {
  await db
    .insert(configuracoesPlataforma)
    .values({ chave: CHAVE_LIMITE_ARMAZENAMENTO_PRO, valor })
    .onConflictDoUpdate({ target: configuracoesPlataforma.chave, set: { valor } })
}

/** Simula o tempo: os períodos dessas assinaturas passam a ter terminado. */
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
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      contador: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
    },
    '119478',
  )
  await db
    .update(perfisProfissionais)
    .set({ tipoProfissional: 'advocacia', emailProfissional: 'contato.juridico@escritorio.teste' })
    .where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
}, 120_000)

beforeEach(() => efiDeTeste.limpar())

afterAll(async () => {
  sairDaSessao()
  await definirIncluido(String(5 * 1024 ** 3))
  const ids = Object.values(contas).map((c) => c.id)
  const lista = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  // Assinaturas do teste: alocações → pagamentos → competências → assinatura.
  await db.execute(sql`delete from assinatura_pagamento_alocacoes where pagamento_id in (select p.id from assinatura_pagamentos p join assinaturas a on a.id = p.assinatura_id where a.cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_pagamentos where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinatura_competencias where assinatura_id in (select id from assinaturas where cliente_usuario_id in (${lista}))`)
  await db.execute(sql`delete from assinaturas where cliente_usuario_id in (${lista})`)
  const { limparAtendimentosDosPrestadores } = await import('./setup/limpeza-atendimentos')
  await limparAtendimentosDosPrestadores(ids)
  await db.delete(oportunidades).where(inArray(oportunidades.clienteUsuarioId, ids))
  await limparContas(SUFIXO)
})

describe('Perfil Essencial', () => {
  it('advogado sem Pro é Essencial; contador não entra na regra', async () => {
    expect((await situacaoDocumentos(db, contas.advogado.id)).nivel).toBe('essencial')
    expect(await situacaoDocumentos(db, contas.contador.id)).toMatchObject({ nivel: null, documentosPelaVincis: true })
  })

  it('não envia nem recebe arquivo no Atendimento, mas conversa por texto', async () => {
    const atendimentoId = (await atendimentoCom(contas.advogado, 'advocacia'))!
    const doCliente = await comSessao(contas.cliente.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))
    expect(doCliente.sucesso).toBe(false)
    expect(doCliente.mensagem).toMatch(/Perfil Essencial/)
    const doAdvogado = await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))
    expect(doAdvogado.sucesso).toBe(false)
    expect(await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimentoId))).toHaveLength(0)

    const texto = await comSessao(contas.cliente.token, () =>
      enviarMensagemAtendimento({ atendimentoId, escopo: 'cliente', conteudo: 'Bom dia, segue a dúvida por texto.' }),
    )
    expect(texto.sucesso).toBe(true)
  })

  it('pedido de orçamento privado com anexo é recusado; sem anexo segue', async () => {
    const base = {
      categoria: 'advocacia',
      descricao: 'Preciso de orientação sobre rescisão de contrato com um fornecedor antigo.',
      abrangencia: 'BR',
      destinatarioId: contas.advogado.id,
    }
    const comAnexo = new FormData()
    for (const [k, v] of Object.entries(base)) comAnexo.set(k, v)
    comAnexo.append('anexos', arquivo('contrato.pdf'))
    const recusado = await comSessao(contas.cliente.token, () => criarOportunidade(comAnexo))
    expect(recusado.sucesso).toBe(false)
    expect(recusado.mensagem).toMatch(/e-mail/)

    const semAnexo = new FormData()
    for (const [k, v] of Object.entries(base)) semAnexo.set(k, v)
    const aceito = await comSessao(contas.cliente.token, () => criarOportunidade(semAnexo))
    expect(aceito.sucesso).toBe(true)
    const nenhum = await db
      .select({ id: oportunidadeArquivos.id })
      .from(oportunidadeArquivos)
      .innerJoin(oportunidades, eq(oportunidades.id, oportunidadeArquivos.oportunidadeId))
      .where(eq(oportunidades.destinatarioId, contas.advogado.id))
    expect(nenhum).toHaveLength(0)
  })

  it('contador segue recebendo arquivo normalmente', async () => {
    const [servico] = await db
      .insert(servicos)
      .values({
        prestadorId: contas.contador.id,
        nome: 'Abertura de empresa',
        descricaoCurta: 'Abertura com enquadramento no Simples.',
        modeloPreco: 'fixo',
        valorCentavos: 50_000,
      })
      .returning({ id: servicos.id })
    const contratado = await comSessao(contas.cliente.token, () => contratarServico({ servicoId: servico.id }))
    if (!contratado.sucesso) throw new Error(contratado.mensagem)
    const enviado = await comSessao(contas.cliente.token, () =>
      anexarArquivoAoAtendimento(formulario(contratado.dados.atendimentoId)),
    )
    expect(enviado.sucesso).toBe(true)
  })
})

describe('Perfil Pro', () => {
  it('contratar não ativa; só o Pix confirmado ativa e libera documentos', async () => {
    const atendimentoId = (await atendimentoCom(contas.advogado, 'advocacia'))!

    // Abrir a aba não cria assinatura nem cobrança.
    await comSessao(contas.advogado.token, () => obterMeuPerfilPro())
    expect(await assinaturasDoAdvogado()).toHaveLength(0)
    expect(efiDeTeste.emissoes).toBe(0)

    // Duplo clique no mesmo período: uma assinatura só.
    const [a, b] = await comSessao(contas.advogado.token, () =>
      Promise.all([contratarPerfilPro({ periodo: 'seis_meses' }), contratarPerfilPro({ periodo: 'seis_meses' })]),
    )
    if (!a.sucesso || !b.sucesso) throw new Error('contratação recusada')
    expect(a.dados.assinaturaId).toBe(b.dados.assinaturaId)
    expect(await assinaturasDoAdvogado()).toHaveLength(1)
    expect(efiDeTeste.emissoes).toBe(0)

    const { assinaturaId, cobrancaId, valor } = await assinarPro('seis_meses')
    expect(assinaturaId).toBe(a.dados.assinaturaId)
    // F5 + clique de novo: mesma cobrança, nenhum Pix novo.
    const repetida = await assinarPro('seis_meses')
    expect(repetida.cobrancaId).toBe(cobrancaId)
    expect(efiDeTeste.emissoes).toBe(1)
    expect(valor).toBe(26_940)
    expect((await situacaoDocumentos(db, contas.advogado.id)).nivel).toBe('essencial')
    expect((await comSessao(contas.cliente.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))).sucesso).toBe(false)

    expect((await pagar(cobrancaId, assinaturaId)).situacao).toBe('pago')
    // Webhook/consulta repetidos não confirmam de novo.
    await sincronizarCobranca(cobrancaId, { forcar: true })
    await sincronizarCobranca(cobrancaId, { forcar: true })
    expect(await pagamentosConfirmados(assinaturaId)).toBe(1)
    const situacao = await situacaoDocumentos(db, contas.advogado.id)
    expect(situacao.nivel).toBe('pro')
    expect(situacao.proAte).not.toBeNull()

    expect((await comSessao(contas.cliente.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))).sucesso).toBe(true)
    expect((await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimentoId)))).sucesso).toBe(true)

    // Pro vigente: nova contratação é recusada (sem renovação/sobreposição).
    expect((await comSessao(contas.advogado.token, () => contratarPerfilPro({ periodo: 'mensal' }))).sucesso).toBe(false)

    const painel = await comSessao(contas.advogado.token, () => obterMeuPerfilPro())
    expect(painel.dados?.armazenamento.usadoBytes).toBe(2048)
    expect(painel.dados?.armazenamento.limiteBytes).toBe(5 * 1024 ** 3)
    expect(painel.dados?.armazenamento.adicionais).toBe(0)
  })

  it('limite configurado: ao atingir, novo envio é bloqueado e nada é apagado', async () => {
    const [atendimento] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.prestadorId, contas.advogado.id))
      .limit(1)
    await db
      .insert(configuracoesPlataforma)
      .values({ chave: CHAVE_LIMITE_ARMAZENAMENTO_PRO, valor: '2500' })
      .onConflictDoUpdate({ target: configuracoesPlataforma.chave, set: { valor: '2500' } })

    const painel = await comSessao(contas.advogado.token, () => obterMeuPerfilPro())
    expect(painel.dados?.armazenamento).toMatchObject({ usadoBytes: 2048, limiteBytes: 2500, proximoDoLimite: true, esgotado: false })

    const bloqueado = await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimento.id)))
    expect(bloqueado.sucesso).toBe(false)
    expect(bloqueado.mensagem).toMatch(/armazenamento/)
    const pequeno = await comSessao(contas.advogado.token, () =>
      anexarArquivoAoAtendimento(formulario(atendimento.id, arquivo('nota.pdf', 400))),
    )
    expect(pequeno.sucesso).toBe(true)
  })

  it('+5 GB: só depois do Pix; idempotente; pode contratar outro; vencido deixa de contar', async () => {
    const [atendimento] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.prestadorId, contas.advogado.id))
      .limit(1)
    // Uso atual (2448 bytes) = limite: esgotado.
    await definirIncluido('2448')
    const cheio = await comSessao(contas.advogado.token, () => obterMeuPerfilPro())
    expect(cheio.dados?.armazenamento).toMatchObject({ usadoBytes: 2448, limiteBytes: 2448, esgotado: true })

    const [x, y] = await comSessao(contas.advogado.token, () =>
      Promise.all([contratarArmazenamentoExtra(), contratarArmazenamentoExtra()]),
    )
    if (!x.sucesso || !y.sucesso) throw new Error('adicional recusado')
    expect(x.dados.assinaturaId).toBe(y.dados.assinaturaId)
    const emitida = await comSessao(contas.advogado.token, () => iniciarPagamentoDoPlano({ assinaturaId: x.dados.assinaturaId }))
    if (emitida.situacao !== 'cobranca') throw new Error(emitida.situacao)
    expect(emitida.cobranca.valorCentavos).toBe(990)
    // Antes da confirmação: nada muda.
    expect(await adicionaisDeArmazenamentoVigentes(db, contas.advogado.id)).toBe(0)

    expect((await pagar(emitida.cobranca.id, x.dados.assinaturaId)).situacao).toBe('pago')
    await sincronizarCobranca(emitida.cobranca.id, { forcar: true })
    expect(await adicionaisDeArmazenamentoVigentes(db, contas.advogado.id)).toBe(1)
    expect((await armazenamentoDoPrestador(db, contas.advogado.id)).limiteBytes).toBe(2448 + 5 * 1024 ** 3)
    expect((await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimento.id)))).sucesso).toBe(true)

    // Segundo adicional, depois: +5 GB de novo (15 GB-equivalente: base + 10 GB).
    const segundo = await comSessao(contas.advogado.token, () => contratarArmazenamentoExtra())
    if (!segundo.sucesso) throw new Error(segundo.mensagem)
    expect(segundo.dados.assinaturaId).not.toBe(x.dados.assinaturaId)
    const emitida2 = await comSessao(contas.advogado.token, () => iniciarPagamentoDoPlano({ assinaturaId: segundo.dados.assinaturaId }))
    if (emitida2.situacao !== 'cobranca') throw new Error(emitida2.situacao)
    await pagar(emitida2.cobranca.id, segundo.dados.assinaturaId)
    expect(await adicionaisDeArmazenamentoVigentes(db, contas.advogado.id)).toBe(2)
    expect((await armazenamentoDoPrestador(db, contas.advogado.id)).limiteBytes).toBe(2448 + 10 * 1024 ** 3)

    // Vencem os adicionais: deixam de contar; arquivos ficam; upload novo trava.
    const antes = await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimento.id))
    await recuarCompetencias([x.dados.assinaturaId, segundo.dados.assinaturaId])
    expect(await adicionaisDeArmazenamentoVigentes(db, contas.advogado.id)).toBe(0)
    expect((await armazenamentoDoPrestador(db, contas.advogado.id)).esgotado).toBe(true)
    expect((await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimento.id)))).sucesso).toBe(false)
    expect(await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimento.id))).toHaveLength(antes.length)
    await definirIncluido(String(5 * 1024 ** 3))
  })

  it('Pro vencido volta a Essencial: bloqueia upload novo e mantém o histórico', async () => {
    const [atendimento] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.prestadorId, contas.advogado.id))
      .limit(1)
    const antes = await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimento.id))

    // Simula o tempo: o período coberto termina ontem.
    const ids = (
      await db.select({ id: assinaturas.id }).from(assinaturas).where(
        and(eq(assinaturas.clienteUsuarioId, contas.advogado.id), eq(assinaturas.status, 'ativa')),
      )
    ).map((l) => l.id)
    await recuarCompetencias(ids)

    expect((await situacaoDocumentos(db, contas.advogado.id)).nivel).toBe('essencial')
    expect((await comSessao(contas.advogado.token, () => anexarArquivoAoAtendimento(formulario(atendimento.id)))).sucesso).toBe(false)
    const depois = await db.select().from(atendimentoArquivos).where(eq(atendimentoArquivos.atendimentoId, atendimento.id))
    expect(depois).toHaveLength(antes.length)
    expect(antes.length).toBeGreaterThan(0)
  })

  it('quem não é advogado não contrata Pro; Essencial não contrata espaço extra', async () => {
    expect((await comSessao(contas.advogado.token, () => contratarArmazenamentoExtra())).sucesso).toBe(false)
    expect((await comSessao(contas.contador.token, () => contratarArmazenamentoExtra())).sucesso).toBe(false)
    expect((await comSessao(contas.contador.token, () => contratarPerfilPro({ periodo: 'mensal' }))).sucesso).toBe(false)
    expect((await comSessao(contas.cliente.token, () => contratarPerfilPro({ periodo: 'mensal' }))).sucesso).toBe(false)
  })
})

describe('OAB em "Formação"', () => {
  it('monta o registro a partir dos campos já salvos, sem duplicar a sigla', async () => {
    const { rotuloRegistroOab } = await import('@/features/servicos/queries/identidade-publica')
    expect(rotuloRegistroOab('123456', 'mg')).toBe('OAB/MG 123456')
    expect(rotuloRegistroOab('123456', null)).toBe('OAB 123456')
    expect(rotuloRegistroOab('OAB/SP 98765', 'SP')).toBe('OAB/SP 98765')
    expect(rotuloRegistroOab('  ', 'MG')).toBeNull()
  })
})
