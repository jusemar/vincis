import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, asc, count, eq, inArray, isNull, or, sql } from 'drizzle-orm'
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
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  parceiroRecebimentos,
  parceiroSaqueItens,
  parceiroSaques,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
} from '@/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '@/features/assinaturas/constants/pagamento'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import { PERCENTUAL_AVULSO } from '@/features/parceiros/constants/programa'
import { gerarTokenDeVisitante } from '@/features/parceiros/lib/visitante'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaDaVitrine } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  PrecoPeriodo,
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { criarContas, limparContas } from './setup/contas-de-teste'
import {
  comSessao,
  definirCookie,
  entrarComo,
  limparCookies,
  sairDaSessao,
} from './setup/sessao'

const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { ativarParceiro } = await import('@/features/parceiros/actions/ativar-parceiro')
const { registrarAcessoPeloLink } = await import('@/features/parceiros/lib/registrar-acesso')
const { obterParceiroDoUsuario } = await import('@/features/parceiros/queries/obter-parceiro')
const { listarComissoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-comissoes'
)
const { listarIndicacoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-indicacoes'
)
const { listarSaquesParaGestao } = await import(
  '@/features/parceiros/queries/listar-saques-gestao'
)
const { solicitarSaque } = await import('@/features/parceiros/actions/solicitar-saque')
const { salvarRecebimento } = await import('@/features/parceiros/actions/salvar-recebimento')
const { marcarSaquePago } = await import('@/features/parceiros/actions/marcar-saque-pago')
const { contratarPlanoVincis } = await import(
  '@/features/assinaturas/actions/contratar-plano'
)
const { confirmarPagamentoDeAssinatura, estornarPagamentoDeAssinatura } = await import(
  '@/features/assinaturas/lib/pagamentos'
)
const { cumprirCompetencia } = await import('@/features/assinaturas/lib/prestacao')
const { cancelarCompetenciasNaoPrestadas, materializarCompetenciaMensal } = await import(
  '@/features/assinaturas/lib/competencias'
)
const { garantirComissaoRecorrenteDaCompetencia } = await import(
  '@/features/parceiros/lib/comissao-recorrente'
)
const { obterConfiguracaoVigente, publicarConfiguracaoDeNiveis } = await import(
  '@/features/parceiros/lib/niveis'
)
const { calcularComissaoCentavos } = await import(
  '@/features/parceiros/lib/registrar-comissao'
)
const { POST } = await import('@/app/api/auth/cadastro/route')

const SUFIXO = '@parceiros.recorrente.teste'
type Chave = 'joao' | 'maria' | 'antigo' | 'gestor'
type Conta = { id: string; token: string; navegador?: string }

let contas: Record<Chave, Conta>
let joao: { id: string; codigo: string }
let maria: { id: string; codigo: string }
let tabela: TabelaPrecificacao
let respostas: RespostasPrecificacao
let contagensIniciais: Awaited<ReturnType<typeof contagens>>
let configuracaoOriginal: Awaited<ReturnType<typeof obterConfiguracaoVigente>>
const AMBIENTE_ORIGINAL = process.env.VINCIS_AMBIENTE
let sequencia = 0

/* ------------------------------------------------------------------ roteiro */

/** O navegador passa pelo link do parceiro: o ciclo anônimo nasce. */
async function visitar(codigo: string, navegador = gerarTokenDeVisitante()) {
  await registrarAcessoPeloLink({
    codigo,
    visitanteToken: navegador,
    userAgent: 'Mozilla/5.0 (teste)',
    referenciaHost: null,
  })
  return navegador
}

/** Cadastro pela rota real, com o cookie do navegador quando houver. */
async function cadastrar(nome: string, navegador?: string): Promise<Conta> {
  sequencia += 1
  const { NextRequest } = await import('next/server')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (navegador) headers.cookie = `${COOKIE_INDICACAO}=${navegador}`
  const resposta = await POST(
    new NextRequest(
      new Request('https://vincis.test/api/auth/cadastro', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nome,
          email: `${nome.toLowerCase().replace(/\W+/g, '.')}${SUFIXO}`,
          whatsapp: `1194849${String(sequencia).padStart(4, '0')}`,
          senha: 'SenhaForte123!',
          confirmarSenha: 'SenhaForte123!',
          perfilTipo: 'cliente',
          aceitouTermos: true,
        }),
      }),
    ),
  )
  const corpo = await resposta.json()
  if (!corpo.dados?.usuarioId) {
    throw new Error(`cadastro falhou: ${resposta.status} ${corpo.mensagem}`)
  }
  const id: string = corpo.dados.usuarioId
  // A conta nasce `pendente_email`; só a sessão precisa dela ativa.
  await db
    .update(usuarios)
    .set({ status: 'ativo', emailVerificado: true, emailVerificadoEm: new Date() })
    .where(eq(usuarios.id, id))
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId: id,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 3600_000),
    userAgent: 'suite-vincis',
  })
  return { id, token, navegador }
}

function prazo(meses: 1 | 6 | 12): PrecoPeriodo {
  return calcularPreco(tabela, 'padrao', respostas).periodos.find(
    (p) => p.meses === meses,
  )!
}

/** `/precos` de verdade: a Server Action com a sessão e o cookie. */
async function contratar(conta: Conta, meses: 1 | 6 | 12, navegador?: string) {
  if (navegador) definirCookie(COOKIE_INDICACAO, navegador)
  try {
    const resultado = await comSessao(conta.token, () =>
      contratarPlanoVincis({
        planoCodigo: 'padrao',
        periodoCodigo: prazo(meses).periodo,
        respostas,
      }),
    )
    if (!resultado.sucesso) throw new Error(resultado.mensagem)
    return resultado.dados!.assinaturaId
  } finally {
    limparCookies()
  }
}

async function pagar(assinaturaId: string, chave = `chave-${crypto.randomUUID()}`) {
  const [contrato] = await db
    .select()
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
  const resultado = await confirmarPagamentoDeAssinatura({
    assinaturaId,
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: chave,
    valorCentavos:
      contrato.periodicidade === 'mensal'
        ? contrato.valorMensalCentavos
        : contrato.valorTotalCentavos,
  })
  if (!resultado.ok) throw new Error(resultado.motivo)
  return { ...resultado, chave }
}

function estornar(chave: string) {
  return estornarPagamentoDeAssinatura({
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: chave,
  })
}

async function competenciasDe(assinaturaId: string) {
  return db
    .select()
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
}

async function mes(assinaturaId: string, numero: number) {
  return (await competenciasDe(assinaturaId)).find((m) => m.numero === numero)!
}

async function cumprir(assinaturaId: string, numero: number) {
  return cumprirCompetencia({ competenciaId: (await mes(assinaturaId, numero)).id })
}

async function comissoesDe(assinaturaId: string) {
  return db
    .select({
      id: parceiroComissoes.id,
      numero: assinaturaCompetencias.numero,
      competenciaId: parceiroComissoes.competenciaId,
      contratacaoId: parceiroComissoes.contratacaoId,
      parceiroId: parceiroComissoes.parceiroId,
      tipo: parceiroComissoes.tipo,
      status: parceiroComissoes.status,
      valorBaseCentavos: parceiroComissoes.valorBaseCentavos,
      percentual: parceiroComissoes.percentual,
      valorCentavos: parceiroComissoes.valorCentavos,
      disponivelEm: parceiroComissoes.disponivelEm,
      canceladaEm: parceiroComissoes.canceladaEm,
      pagamentoEstornadoEm: parceiroComissoes.pagamentoEstornadoEm,
    })
    .from(parceiroComissoes)
    .innerJoin(
      assinaturaCompetencias,
      eq(assinaturaCompetencias.id, parceiroComissoes.competenciaId),
    )
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
}

async function atribuicaoDa(assinaturaId: string) {
  const [linha] = await db
    .select()
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.assinaturaId, assinaturaId))
  return linha ?? null
}

async function contagens() {
  const [[op], [cp], [o], [avulsas]] = await Promise.all([
    db.select({ n: count() }).from(oportunidadePagamentos),
    db.select({ n: count() }).from(consultoriaPagamentos),
    db.select({ n: count() }).from(oportunidades),
    db
      .select({ n: count() })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.tipo, 'avulso')),
  ])
  return { op: op.n, cp: cp.n, o: o.n, avulsas: avulsas.n }
}

/* ---------------------------------------------------------------- cenário */

beforeAll(async () => {
  process.env.VINCIS_AMBIENTE = 'homologacao'
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      maria: { perfil: 'cliente' },
      antigo: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119484',
  )) as Record<Chave, Conta>

  for (const chave of ['joao', 'maria'] as const) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
    await salvarRecebimento({
      tipoChave: 'email',
      chave: `${chave}.recorrente@vincis.local`,
      titular: `Titular ${chave}`,
    })
    sairDaSessao()
  }
  joao = (await obterParceiroDoUsuario(contas.joao.id))!
  maria = (await obterParceiroDoUsuario(contas.maria.id))!

  tabela = await obterTabelaDaVitrine()
  respostas = respostasIniciais(tabela)
  contagensIniciais = await contagens()

  /*
    Esta suíte é sobre a comissão recorrente, não sobre níveis: todos os
    parceiros dela ficam na base, com o percentual de entrada da configuração.
    Os mínimos altos são fixture desta suíte; a original volta no fim.
  */
  configuracaoOriginal = await obterConfiguracaoVigente()
  const publicada = await publicarConfiguracaoDeNiveis({
    protecaoDias: 30,
    regras: [
      { codigo: 'bronze', minimoClientes: 0, percentualCentesimos: 500 },
      { codigo: 'prata', minimoClientes: 1_000, percentualCentesimos: 750 },
      { codigo: 'ouro', minimoClientes: 2_000, percentualCentesimos: 1_000 },
    ],
    autorId: null,
  })
  if (!publicada.ok) throw new Error(publicada.mensagem)
})

afterAll(async () => {
  sairDaSessao()
  limparCookies()
  if (configuracaoOriginal?.ok) {
    await publicarConfiguracaoDeNiveis({
      protecaoDias: configuracaoOriginal.configuracao.protecaoDias,
      regras: configuracaoOriginal.configuracao.niveis.map((n) => ({
        codigo: n.codigo,
        minimoClientes: n.minimoClientes,
        percentualCentesimos: n.percentualCentesimos,
      })),
      autorId: null,
    })
  }
  if (AMBIENTE_ORIGINAL === undefined) delete process.env.VINCIS_AMBIENTE
  else process.env.VINCIS_AMBIENTE = AMBIENTE_ORIGINAL

  const parceirosIds = [joao.id, maria.id]
  const saques = (
    await db
      .select({ id: parceiroSaques.id })
      .from(parceiroSaques)
      .where(inArray(parceiroSaques.parceiroId, parceirosIds))
  ).map((s) => s.id)
  if (saques.length) {
    await db.delete(parceiroSaqueItens).where(inArray(parceiroSaqueItens.saqueId, saques))
    await db.delete(parceiroSaques).where(inArray(parceiroSaques.id, saques))
  }
  await db
    .delete(parceiroRecebimentos)
    .where(inArray(parceiroRecebimentos.parceiroId, parceirosIds))
  await db.delete(parceiroComissoes).where(inArray(parceiroComissoes.parceiroId, parceirosIds))

  const usuariosDoCenario = (
    await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(sql`${usuarios.email} like ${`%${SUFIXO}`}`)
  ).map((u) => u.id)
  const doCenario = (
    await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(inArray(assinaturas.clienteUsuarioId, usuariosDoCenario))
  ).map((a) => a.id)
  await db
    .delete(parceiroAtribuicoes)
    .where(inArray(parceiroAtribuicoes.parceiroId, parceirosIds))
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
    await db.delete(assinaturas).where(inArray(assinaturas.id, doCenario))
  }
  const ciclos = (
    await db
      .select({ id: parceiroIndicacoes.id })
      .from(parceiroIndicacoes)
      .where(inArray(parceiroIndicacoes.parceiroId, parceirosIds))
  ).map((c) => c.id)
  if (ciclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ciclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ciclos))
  }
  await db
    .delete(eventosAuditoria)
    .where(
      or(
        inArray(eventosAuditoria.autorId, usuariosDoCenario),
        inArray(eventosAuditoria.usuarioId, usuariosDoCenario),
        sql`${eventosAuditoria.metadados}->>'parceiroId' in (${sql.join(
          parceirosIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, usuariosDoCenario))
  await limparContas(SUFIXO)
})

/* ------------------------------------------------------------ atribuição */

let carlos: Conta
let carlosSemestral: string
let chaveCarlos: string

describe('a atribuição nasce na ativação da primeira assinatura', () => {
  it('conta nascida pelo link de João: a assinatura paga fica com João, sem prazo', async () => {
    carlos = await cadastrar('Carlos Recorrente', await visitar(joao.codigo))
    carlosSemestral = await contratar(carlos, 6)
    // Contratar não consome a origem: o vínculo nasce na ativação.
    expect(await atribuicaoDa(carlosSemestral)).toBeNull()
    chaveCarlos = (await pagar(carlosSemestral)).chave

    const atribuicao = await atribuicaoDa(carlosSemestral)
    expect(atribuicao).toMatchObject({
      parceiroId: joao.id,
      usuarioId: carlos.id,
      resolvidaPor: 'conta',
      prazoDias: null,
      expiraEm: null,
      oportunidadeId: null,
      contratacaoId: null,
    })
    // Pagar adiantado não gera comissão nenhuma.
    expect(await comissoesDe(carlosSemestral)).toHaveLength(0)

    const [evento] = await db
      .select()
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.acao, 'assinatura_atribuida_parceiro'),
          eq(eventosAuditoria.registroAfetado, atribuicao!.id),
        ),
      )
    expect(evento).toBeDefined()
  })

  it('sem parceiro: contrata, paga e cumpre normalmente, sem comissão', async () => {
    const conta = await cadastrar('Sem Parceiro')
    const id = await contratar(conta, 6)
    expect(await atribuicaoDa(id)).toBeNull()
    await pagar(id)
    const cumprimento = await cumprir(id, 1)
    expect(cumprimento).toMatchObject({
      ok: true,
      comissao: { criada: false, motivo: 'sem_parceiro' },
    })
    expect((await mes(id, 1)).status).toBe('cumprida')
    expect(await comissoesDe(id)).toHaveLength(0)
  })

  it('usuário já cadastrado que passa pelo link depois não é capturado', async () => {
    const navegador = await visitar(joao.codigo)
    const id = await contratar(contas.antigo, 6, navegador)
    expect(await atribuicaoDa(id)).toBeNull()
    await pagar(id)
    await cumprir(id, 1)
    expect(await comissoesDe(id)).toHaveLength(0)
    // O ciclo continua anônimo: ninguém reivindicou a conta antiga.
    const [ciclo] = await db
      .select({ usuarioId: parceiroIndicacoes.usuarioId })
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.parceiroId, joao.id))
      .orderBy(sql`${parceiroIndicacoes.createdAt} desc`)
      .limit(1)
    expect(ciclo.usuarioId).toBeNull()
  })

  it('João e depois Maria antes do cadastro: vale Maria', async () => {
    const navegador = await visitar(joao.codigo)
    await visitar(maria.codigo, navegador)
    const dora = await cadastrar('Dora Maria', navegador)
    const id = await contratar(dora, 6, navegador)
    await pagar(id)
    expect((await atribuicaoDa(id))!.parceiroId).toBe(maria.id)
  })

  it('clique em outro link depois do cadastro não troca o parceiro', async () => {
    const eva = await cadastrar('Eva Joao', await visitar(joao.codigo))
    await visitar(maria.codigo, eva.navegador)
    const id = await contratar(eva, 6, eva.navegador)
    await pagar(id)
    expect((await atribuicaoDa(id))!.parceiroId).toBe(joao.id)
  })

  it('a segunda assinatura da mesma conta nasce sem parceiro', async () => {
    const segunda = await contratar(carlos, 12)
    expect(await atribuicaoDa(segunda)).toBeNull()
    await pagar(segunda)
    await cumprir(segunda, 1)
    expect(await comissoesDe(segunda)).toHaveLength(0)
    // A primeira continua com João.
    expect((await atribuicaoDa(carlosSemestral))!.parceiroId).toBe(joao.id)
  })

  it('recontratar depois de cancelar a primeira não devolve o parceiro', async () => {
    const fabio = await cadastrar('Fabio Recontrata', await visitar(joao.codigo))
    const primeira = await contratar(fabio, 6)
    await pagar(primeira)
    expect(await atribuicaoDa(primeira)).not.toBeNull()
    await db
      .update(assinaturas)
      .set({ status: 'cancelada', canceladoEm: new Date() })
      .where(eq(assinaturas.id, primeira))
    const nova = await contratar(fabio, 12)
    await pagar(nova)
    expect(await atribuicaoDa(nova)).toBeNull()
    // A atribuição da primeira não foi reescrita nem apagada.
    expect((await atribuicaoDa(primeira))!.parceiroId).toBe(joao.id)
  })

  it('B e C pagas ao mesmo tempo: só uma consome a origem', async () => {
    const gabi = await cadastrar('Gabi Concorrente', await visitar(joao.codigo))
    const ids = await Promise.all([contratar(gabi, 6), contratar(gabi, 12)])
    expect((await Promise.all(ids.map(atribuicaoDa))).filter(Boolean)).toHaveLength(0)

    await Promise.all(ids.map((id) => pagar(id)))
    const atribuidas = (await Promise.all(ids.map(atribuicaoDa))).filter(Boolean)
    expect(atribuidas).toHaveLength(1)
    expect(atribuidas[0]!.parceiroId).toBe(joao.id)
    // As duas foram ativadas; só uma tem parceiro.
    const status = await db
      .select({ status: assinaturas.status })
      .from(assinaturas)
      .where(inArray(assinaturas.id, ids))
    expect(status.every((a) => a.status === 'ativa')).toBe(true)
  })

  it('A abandonada, B paga: só B fica com João; C, depois, não herda', async () => {
    const navegador = await visitar(joao.codigo)
    const rui = await cadastrar('Rui Abandona', navegador)
    const a = await contratar(rui, 6)
    const b = await contratar(rui, 12)
    expect(await atribuicaoDa(a)).toBeNull()
    expect(await atribuicaoDa(b)).toBeNull()

    await pagar(b)
    expect(await atribuicaoDa(a)).toBeNull()
    expect((await atribuicaoDa(b))!.parceiroId).toBe(joao.id)

    // A nunca foi paga: cumprida ou não, não gera nada.
    await cumprir(a, 1)
    expect(await comissoesDe(a)).toHaveLength(0)
    // B gera a comissão de João pelo mês cumprido.
    await cumprir(b, 1)
    expect((await comissoesDe(b)).map((c) => c.parceiroId)).toEqual([joao.id])

    // Clique em Maria depois do cadastro, e C contratada e paga: sem parceiro.
    await visitar(maria.codigo, navegador)
    const c = await contratar(rui, 1, navegador)
    await pagar(c)
    expect(await atribuicaoDa(c)).toBeNull()
    await cumprir(c, 1)
    expect(await comissoesDe(c)).toHaveLength(0)

    // Nem A, paga tarde, recupera a origem já consumida por B.
    await pagar(a)
    expect(await atribuicaoDa(a)).toBeNull()
    expect(await comissoesDe(a)).toHaveLength(0)
    expect(
      await db
        .select({ id: parceiroAtribuicoes.id })
        .from(parceiroAtribuicoes)
        .where(eq(parceiroAtribuicoes.parceiroId, maria.id))
        .then((linhas) => linhas.length),
    ).toBe(1) // só a de Dora, do teste do último parceiro antes do cadastro
  })
})

/* ------------------------------------------------ comissão mês a mês */

describe('semestral pago adiantado: uma comissão por mês cumprido', () => {
  it('pago no primeiro teste: nenhuma comissão no dia do pagamento', async () => {
    expect(await comissoesDe(carlosSemestral)).toHaveLength(0)
    const meses = await competenciasDe(carlosSemestral)
    expect(meses.filter((m) => m.status === 'cumprida')).toHaveLength(0)
  })

  it('cumprir o mês 1 cria exatamente uma comissão de 5% do mês', async () => {
    const primeiro = await mes(carlosSemestral, 1)
    const resultado = await cumprir(carlosSemestral, 1)
    expect(resultado).toMatchObject({ ok: true, comissao: { criada: true } })

    const comissoes = await comissoesDe(carlosSemestral)
    expect(comissoes).toHaveLength(1)
    expect(comissoes[0]).toMatchObject({
      numero: 1,
      competenciaId: primeiro.id,
      contratacaoId: null,
      parceiroId: joao.id,
      tipo: 'recorrente',
      status: 'disponivel',
      valorBaseCentavos: primeiro.valorBaseCentavos,
      percentual: '5.00',
      valorCentavos: Math.round((primeiro.valorBaseCentavos * 5) / 100),
    })
    expect(comissoes[0].disponivelEm).not.toBeNull()
  })

  it('cumprir o mês 2 cria a segunda; 3 a 6 continuam sem comissão', async () => {
    await cumprir(carlosSemestral, 2)
    const comissoes = await comissoesDe(carlosSemestral)
    expect(comissoes.map((c) => c.numero)).toEqual([1, 2])
  })

  it('repetir o cumprimento e o pagamento não duplica', async () => {
    expect(await cumprir(carlosSemestral, 1)).toMatchObject({
      ok: true,
      jaEstavaCumprida: true,
      comissao: { criada: false, motivo: 'ja_existia' },
    })
    expect(await pagar(carlosSemestral, chaveCarlos)).toMatchObject({ repetido: true })
    const primeiro = await mes(carlosSemestral, 1)
    expect(
      await db.transaction((tx) => garantirComissaoRecorrenteDaCompetencia(tx, primeiro.id)),
    ).toEqual({ criada: false, motivo: 'ja_existia' })
    expect(await comissoesDe(carlosSemestral)).toHaveLength(2)
  })

  it('a comissão congela base, percentual e valor', async () => {
    const primeiro = await mes(carlosSemestral, 1)
    const [antes] = await comissoesDe(carlosSemestral)
    await db
      .update(assinaturaCompetencias)
      .set({ valorBaseCentavos: primeiro.valorBaseCentavos * 3 })
      .where(eq(assinaturaCompetencias.id, primeiro.id))
    await cumprir(carlosSemestral, 1)
    const [depois] = await comissoesDe(carlosSemestral)
    expect(depois).toEqual(antes)
    await db
      .update(assinaturaCompetencias)
      .set({ valorBaseCentavos: primeiro.valorBaseCentavos })
      .where(eq(assinaturaCompetencias.id, primeiro.id))
  })
})

describe('as duas ordens', () => {
  it('cumprido antes do pagamento: a comissão nasce quando o dinheiro chega', async () => {
    const helena = await cadastrar('Helena Ordem', await visitar(joao.codigo))
    const id = await contratar(helena, 6)
    // Antes do pagamento não há ativação, nem parceiro, nem dinheiro.
    expect(await cumprir(id, 1)).toMatchObject({
      ok: true,
      comissao: { criada: false },
    })
    expect(await comissoesDe(id)).toHaveLength(0)

    await pagar(id)
    const comissoes = await comissoesDe(id)
    expect(comissoes.map((c) => c.numero)).toEqual([1])
    expect((await mes(id, 1)).status).toBe('cumprida')
  })
})

describe('concorrência', () => {
  it('cinco cumprimentos simultâneos do mesmo mês: uma comissão', async () => {
    const ivo = await cadastrar('Ivo Corrida', await visitar(joao.codigo))
    const id = await contratar(ivo, 6)
    await pagar(id)
    const primeiro = await mes(id, 1)
    await Promise.all(
      Array.from({ length: 5 }, () => cumprirCompetencia({ competenciaId: primeiro.id })),
    )
    expect(await comissoesDe(id)).toHaveLength(1)
  })

  it('cumprir e pagar ao mesmo tempo: uma comissão, qualquer que seja a ordem', async () => {
    const julia = await cadastrar('Julia Corrida', await visitar(joao.codigo))
    const id = await contratar(julia, 6)
    const primeiro = await mes(id, 1)
    await Promise.all([cumprirCompetencia({ competenciaId: primeiro.id }), pagar(id)])
    const comissoes = await comissoesDe(id)
    expect(comissoes.map((c) => c.numero)).toEqual([1])
  })
})

describe('anual e mensal seguem a mesma regra', () => {
  let karlaChave: string
  it('anual: pagamento sem comissão; mês 1 cumprido gera uma', async () => {
    const karla = await cadastrar('Karla Anual', await visitar(joao.codigo))
    const id = await contratar(karla, 12)
    karlaChave = (await pagar(id)).chave
    expect(await comissoesDe(id)).toHaveLength(0)
    await cumprir(id, 1)
    const comissoes = await comissoesDe(id)
    expect(comissoes.map((c) => c.numero)).toEqual([1])
    expect((await competenciasDe(id)).length).toBe(12)
    ;(globalThis as { karla?: { id: string; chave: string } }).karla = { id, chave: karlaChave }
  })

  it('mensal: cada mês pago e cumprido gera a sua; renovar sozinho não gera', async () => {
    const leo = await cadastrar('Leo Mensal', await visitar(joao.codigo))
    const id = await contratar(leo, 1)
    await pagar(id)
    expect(await comissoesDe(id)).toHaveLength(0)
    await cumprir(id, 1)
    expect(await comissoesDe(id)).toHaveLength(1)

    await pagar(id) // renovação: materializa e cobre o mês 2
    expect((await competenciasDe(id)).map((m) => m.numero)).toEqual([1, 2])
    expect(await comissoesDe(id)).toHaveLength(1)

    await cumprir(id, 2)
    expect((await comissoesDe(id)).map((c) => c.numero)).toEqual([1, 2])
  })
})

describe('o que não gera comissão', () => {
  it('mês cancelado', async () => {
    const marcos = await cadastrar('Marcos Cancela', await visitar(joao.codigo))
    const id = await contratar(marcos, 6)
    await pagar(id)
    await cancelarCompetenciasNaoPrestadas(db, id)
    expect(await cumprir(id, 6)).toEqual({ ok: false, motivo: 'competencia_cancelada' })
    const sexto = await mes(id, 6)
    expect(
      await db.transaction((tx) => garantirComissaoRecorrenteDaCompetencia(tx, sexto.id)),
    ).toEqual({ criada: false, motivo: 'nao_cumprida' })
    expect(await comissoesDe(id)).toHaveLength(0)
  })

  it('alocação de pagamento pendente não conta como dinheiro', async () => {
    const nina = await cadastrar('Nina Pendente', await visitar(joao.codigo))
    const id = await contratar(nina, 1)
    await pagar(id) // ativa: mês 1 coberto, origem consumida por esta assinatura
    expect(await atribuicaoDa(id)).not.toBeNull()

    expect(await materializarCompetenciaMensal(db, { assinaturaId: id, numero: 2 })).toBe(
      'criada',
    )
    const segundo = await mes(id, 2)
    const [pendente] = await db
      .insert(assinaturaPagamentos)
      .values({
        assinaturaId: id,
        valorCentavos: segundo.valorBaseCentavos,
        provedor: PROVEDOR_HOMOLOGACAO,
        chaveIdempotencia: `pendente-${id}`,
      })
      .returning({ id: assinaturaPagamentos.id })
    await db.insert(assinaturaPagamentoAlocacoes).values({
      pagamentoId: pendente.id,
      competenciaId: segundo.id,
      assinaturaId: id,
      valorCentavos: segundo.valorBaseCentavos,
    })
    expect(await cumprir(id, 2)).toMatchObject({
      comissao: { criada: false, motivo: 'sem_cobertura_confirmada' },
    })
    expect(await comissoesDe(id)).toHaveLength(0)
  })

  it('cálculo em centavos inteiros, 5% determinístico, avulso segue 10%', async () => {
    // O percentual de entrada vem da configuração publicada, não de constante.
    const vigente = await obterConfiguracaoVigente()
    expect(vigente.ok && vigente.configuracao.niveis[0].percentualCentesimos).toBe(500)
    expect(PERCENTUAL_AVULSO).toBe(10)
    expect(calcularComissaoCentavos(24_000, 5)).toBe(1_200)
    expect(calcularComissaoCentavos(33_333, 5)).toBe(1_667) // 1.666,65 → 1.667
    expect(calcularComissaoCentavos(43_810, 5)).toBe(2_191) // 2.190,5 → 2.191
    expect(calcularComissaoCentavos(10, 5)).toBe(1)
    expect(calcularComissaoCentavos(9, 5)).toBe(0)
    expect(Number.isInteger(calcularComissaoCentavos(99_999, 5))).toBe(true)
  })
})

/* ------------------------------------------------------------- estorno */

describe('estorno do pagamento', () => {
  it('comissão disponível e livre é cancelada, com o carimbo do estorno', async () => {
    const otto = await cadastrar('Otto Estorno', await visitar(joao.codigo))
    const id = await contratar(otto, 6)
    const { chave } = await pagar(id)
    await cumprir(id, 1)

    const resultado = await estornar(chave)
    expect(resultado).toMatchObject({ ok: true, repetido: false })
    const [comissao] = await comissoesDe(id)
    expect(comissao.status).toBe('cancelada')
    expect(comissao.canceladaEm).not.toBeNull()
    expect(comissao.pagamentoEstornadoEm).not.toBeNull()

    expect(await estornar(chave)).toMatchObject({ ok: true, repetido: true })
    // Sem dinheiro confirmado, o mês seguinte cumprido também não gera.
    expect(await cumprir(id, 2)).toMatchObject({
      comissao: { criada: false, motivo: 'sem_cobertura_confirmada' },
    })
  })

  let saqueDeJoao: string
  it('o saldo livre inclui a recorrente, e o saque a reserva', async () => {
    const { resumo, comissoes } = await listarComissoesDoParceiro(joao.id)
    const disponiveis = comissoes.filter((c) => c.status === 'disponivel')
    expect(disponiveis.every((c) => c.tipo === 'recorrente')).toBe(true)
    expect(resumo.livreCentavos).toBe(
      disponiveis.reduce((t, c) => t + c.valorCentavos, 0),
    )
    expect(resumo.livreCentavos).toBeGreaterThan(0)

    entrarComo(contas.joao.token)
    const saque = await solicitarSaque()
    sairDaSessao()
    if (!saque.sucesso) throw new Error(saque.mensagem)
    saqueDeJoao = saque.dados!.saqueId
    expect(saque.dados!.valorCentavos).toBe(resumo.livreCentavos)
    const itens = await db
      .select({ comissaoId: parceiroSaqueItens.comissaoId })
      .from(parceiroSaqueItens)
      .where(eq(parceiroSaqueItens.saqueId, saqueDeJoao))
    expect(itens.map((i) => i.comissaoId).sort()).toEqual(
      disponiveis.map((c) => c.id).sort(),
    )
  })

  it('estorno de comissão reservada: sai do saque, que continua com o valor refeito', async () => {
    const [antes] = await db
      .select()
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saqueDeJoao))
    const deCarlos = await comissoesDe(carlosSemestral)
    const retirado = deCarlos.reduce((t, c) => t + c.valorCentavos, 0)

    const resultado = await estornar(chaveCarlos)
    expect(resultado.ok).toBe(true)

    const depoisCarlos = await comissoesDe(carlosSemestral)
    expect(depoisCarlos.every((c) => c.status === 'cancelada')).toBe(true)
    const [depois] = await db
      .select()
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saqueDeJoao))
    expect(depois.status).toBe('solicitado')
    expect(depois.valorCentavos).toBe(antes.valorCentavos - retirado)

    const ativos = await db
      .select({ valor: parceiroSaqueItens.valorCentavos })
      .from(parceiroSaqueItens)
      .where(
        and(eq(parceiroSaqueItens.saqueId, saqueDeJoao), isNull(parceiroSaqueItens.liberadoEm)),
      )
    expect(ativos.reduce((t, i) => t + i.valor, 0)).toBe(depois.valorCentavos)

    const { resumo } = await listarComissoesDoParceiro(joao.id)
    expect(resumo.reservadoCentavos).toBe(depois.valorCentavos)
    expect(resumo.livreCentavos).toBe(0)

    const gestao = await listarSaquesParaGestao()
    const doSaque = gestao.find((s) => s.id === saqueDeJoao)!
    expect(doSaque.valorCentavos).toBe(depois.valorCentavos)
  })

  it('estorno da última comissão do saque: o saque é cancelado com o motivo', async () => {
    const pedro = await cadastrar('Pedro Maria', await visitar(maria.codigo))
    const id = await contratar(pedro, 6)
    const { chave } = await pagar(id)
    await cumprir(id, 1)

    entrarComo(contas.maria.token)
    const saque = await solicitarSaque()
    sairDaSessao()
    if (!saque.sucesso) throw new Error(saque.mensagem)

    await estornar(chave)
    const [depois] = await db
      .select()
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saque.dados!.saqueId))
    expect(depois.status).toBe('cancelado')
    expect(depois.canceladoEm).not.toBeNull()
    expect(depois.observacao).toMatch(/estornado/)
    expect(depois.valorCentavos).toBeGreaterThan(0)
    const { resumo } = await listarComissoesDoParceiro(maria.id)
    expect(resumo).toMatchObject({ livreCentavos: 0, reservadoCentavos: 0, disponivelCentavos: 0 })
  })

  it('comissão já paga: continua paga, sinalizada; o saque pago não é revertido', async () => {
    entrarComo(contas.gestor.token)
    const pago = await marcarSaquePago({ saqueId: saqueDeJoao })
    sairDaSessao()
    expect(pago.sucesso).toBe(true)

    const karla = (globalThis as { karla?: { id: string; chave: string } }).karla!
    const [antes] = await comissoesDe(karla.id)
    expect(antes.status).toBe('paga')

    const resultado = await estornar(karla.chave)
    if (!resultado.ok) throw new Error(resultado.motivo)
    // O anual cobre 12 meses; só o mês 1 tinha comissão — já paga.
    expect(resultado.comissoes).toHaveLength(12)
    expect(resultado.comissoes.filter((d) => d === 'paga_sinalizada')).toHaveLength(1)
    expect(resultado.comissoes.filter((d) => d === 'sem_comissao')).toHaveLength(11)
    const [depois] = await comissoesDe(karla.id)
    expect(depois.status).toBe('paga')
    expect(depois.pagamentoEstornadoEm).not.toBeNull()
    const [saque] = await db
      .select()
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, saqueDeJoao))
    expect(saque.status).toBe('pago')
  })
})

/* ------------------------------------------------------------- painel */

describe('painel do parceiro', () => {
  it('Comissões lista a recorrente com plano, mês, base, 5% e status', async () => {
    const { comissoes } = await listarComissoesDoParceiro(joao.id)
    const recorrentes = comissoes.filter((c) => c.tipo === 'recorrente')
    expect(recorrentes.length).toBeGreaterThan(0)
    for (const comissao of recorrentes) {
      expect(comissao.servico).toBeTruthy()
      expect(comissao.competencia?.numero).toBeGreaterThan(0)
      expect(comissao.competencia?.inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(comissao.percentual).toBe(5)
      expect(comissao.clienteNome).toBeTruthy()
    }
  })

  it('Indicações mostra a assinatura uma vez, como negócio recorrente', async () => {
    const ciclos = await listarIndicacoesDoParceiro(joao.id)
    const negocios = ciclos.flatMap((c) => c.negocios)
    const atribuicao = await atribuicaoDa(carlosSemestral)
    const doCarlos = negocios.filter((n) => n.id === atribuicao!.id)
    expect(doCarlos).toHaveLength(1)
    expect(doCarlos[0]).toMatchObject({ tipo: 'recorrente', contratado: true, comissao: null })
    expect(doCarlos[0].nome).toBeTruthy()
  })
})

/* ---------------------------------------------------------- isolamento */

describe('isolamento', () => {
  it('pagamentos simulados, oportunidades e avulsas não mudaram', async () => {
    expect(await contagens()).toEqual(contagensIniciais)
  })
})

/* ------------------------------------------------------- travas do banco */

describe('as travas do banco', () => {
  it('recorrente sem mês, avulsa sem contratação e o mesmo mês duas vezes são recusados', async () => {
    const atribuicao = await atribuicaoDa(carlosSemestral)
    const base = {
      parceiroId: joao.id,
      atribuicaoId: atribuicao!.id,
      clienteUsuarioId: carlos.id,
      valorBaseCentavos: 100,
      percentual: '5.00',
      valorCentavos: 5,
    }
    await expect(
      db.insert(parceiroComissoes).values({ ...base, tipo: 'recorrente' }),
    ).rejects.toThrow()
    await expect(
      db.insert(parceiroComissoes).values({ ...base, tipo: 'avulso' }),
    ).rejects.toThrow()
    await expect(
      db.insert(parceiroComissoes).values({
        ...base,
        tipo: 'mensalidade',
        competenciaId: (await mes(carlosSemestral, 3)).id,
      }),
    ).rejects.toThrow()
    const primeiro = await mes(carlosSemestral, 1)
    await expect(
      db
        .insert(parceiroComissoes)
        .values({ ...base, tipo: 'recorrente', competenciaId: primeiro.id }),
    ).rejects.toThrow()
  })

  it('a indicação que já originou uma assinatura não origina outra', async () => {
    const atribuicao = await atribuicaoDa(carlosSemestral)
    const outra = (
      await db
        .select({ id: assinaturas.id })
        .from(assinaturas)
        .where(eq(assinaturas.clienteUsuarioId, carlos.id))
    ).find((a) => a.id !== carlosSemestral)!
    await expect(
      db.insert(parceiroAtribuicoes).values({
        indicacaoId: atribuicao!.indicacaoId,
        parceiroId: joao.id,
        usuarioId: carlos.id,
        assinaturaId: outra.id,
        resolvidaPor: 'conta',
      }),
    ).rejects.toThrow()
    // Nem atribuição sem origem nenhuma.
    await expect(
      db.insert(parceiroAtribuicoes).values({
        indicacaoId: atribuicao!.indicacaoId,
        parceiroId: joao.id,
        usuarioId: carlos.id,
        resolvidaPor: 'conta',
      }),
    ).rejects.toThrow()
  })
})
