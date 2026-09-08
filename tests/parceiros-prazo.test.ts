import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  configuracoesPlataforma,
  eventosAuditoria,
  oportunidadeArquivos,
  oportunidadeMensagens,
  oportunidades,
  parceiroAtribuicoes,
  parceiroEventos,
  parceiroIndicacoes,
  parceiroPrazos,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { CHAVE_PRAZO_PARCEIRO, CONFIGURACOES } from '@/features/configuracoes/lib/configuracoes'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import {
  calcularExpiracao,
  diasRestantes,
  situacaoDaAtribuicao,
} from '@/features/parceiros/constants/prazo'
import { gerarTokenDeVisitante } from '@/features/parceiros/lib/visitante'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { definirCookie, entrarComo, limparCookies, sairDaSessao } from './setup/sessao'

const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({ enviarEmailConfirmacao }))

const { ativarParceiro } = await import('@/features/parceiros/actions/ativar-parceiro')
const { registrarAcessoPeloLink } = await import(
  '@/features/parceiros/lib/registrar-acesso'
)
const { listarIndicacoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-indicacoes'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { obterPrazoVigente } = await import('@/features/parceiros/queries/obter-prazo')
const {
  definirPrazoPadraoDeParceiro,
  definirPrazoDoServico,
} = await import('@/features/parceiros/actions/definir-prazo')
const { criarOportunidade } = await import(
  '@/features/oportunidades/actions/oportunidades'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { POST } = await import('@/app/api/auth/cadastro/route')

const SUFIXO = '@parceiros.prazo.teste'
const SUFIXO_NOVOS = '@parceiros.prazo.novos.teste'
type Chave = 'joao' | 'gestor' | 'clienteComum' | 'pedro'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let indice = 0

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
      clienteComum: { perfil: 'cliente' },
      pedro: { perfil: 'profissional', prestador: 'profissional' },
    },
    '119499',
  )) as Record<Chave, { id: string; token: string }>

  entrarComo(contas.joao.token)
  await ativarParceiro()
  sairDaSessao()
  joao = (await obterParceiroDoUsuario(contas.joao.id))!
})

afterAll(async () => {
  sairDaSessao()
  limparCookies()
  await limpar()
  await limparContas(SUFIXO)
})

afterEach(() => {
  limparCookies()
  sairDaSessao()
})

async function limpar() {
  const novos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO_NOVOS}`))
  const idsNovos = novos.map(({ id }) => id)
  const donos = [...idsNovos, ...Object.values(contas ?? {}).map((c) => c.id)]

  const delas = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, donos))
  const ids = delas.map(({ id }) => id)
  if (ids.length) {
    await db.delete(parceiroAtribuicoes).where(inArray(parceiroAtribuicoes.oportunidadeId, ids))
    await db.delete(oportunidadeMensagens).where(inArray(oportunidadeMensagens.oportunidadeId, ids))
    await db.delete(oportunidadeArquivos).where(inArray(oportunidadeArquivos.oportunidadeId, ids))
    await db.delete(oportunidades).where(inArray(oportunidades.id, ids))
  }

  const ciclos = await db
    .select({ id: parceiroIndicacoes.id })
    .from(parceiroIndicacoes)
    .where(eq(parceiroIndicacoes.parceiroId, joao.id))
  const idsCiclos = ciclos.map(({ id }) => id)
  if (idsCiclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, idsCiclos))
    await db
      .update(parceiroIndicacoes)
      .set({ substituidaPorId: null })
      .where(inArray(parceiroIndicacoes.id, idsCiclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, idsCiclos))
  }

  if (donos.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, donos))
  }
  if (idsNovos.length) {
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, idsNovos))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, idsNovos))
    await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, idsNovos))
    await db.delete(usuarios).where(inArray(usuarios.id, idsNovos))
  }
  await db.delete(parceiroPrazos)
  await db
    .delete(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_PRAZO_PARCEIRO))
}

beforeEach(async () => {
  limparCookies()
  await limpar()
})

async function visitarLink(codigo: string, navegador?: string) {
  const token = navegador ?? gerarTokenDeVisitante()
  await registrarAcessoPeloLink({
    codigo,
    visitanteToken: token,
    userAgent: 'Mozilla/5.0 (teste)',
    referenciaHost: null,
  })
  return token
}

async function cadastrar(nome: string, navegador?: string) {
  indice += 1
  const requisicao = new Request('https://vincis.test/api/auth/cadastro', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(navegador ? { cookie: `${COOKIE_INDICACAO}=${navegador}` } : {}),
    },
    body: JSON.stringify({
      nome,
      email: `prazo${indice}${SUFIXO_NOVOS}`,
      whatsapp: `1198873${String(4000 + indice)}`,
      senha: 'SenhaForte123!',
      confirmarSenha: 'SenhaForte123!',
      perfilTipo: 'cliente',
      aceitouTermos: true,
    }),
  })
  const { NextRequest } = await import('next/server')
  const resposta = await POST(new NextRequest(requisicao))
  const usuarioId = (await resposta.json())?.dados?.usuarioId as string

  await db
    .update(usuarios)
    .set({ status: 'ativo', emailVerificado: true, emailVerificadoEm: new Date() })
    .where(eq(usuarios.id, usuarioId))
  const { gerarTokenSessao } = await import('@/features/usuarios/lib/gerar-token-sessao')
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 3600_000),
    userAgent: 'suite-vincis',
  })
  return { usuarioId, sessao: token }
}

function formulario(categoria: string) {
  const form = new FormData()
  form.set('categoria', categoria)
  form.set('descricao', 'Preciso de apoio profissional recorrente para a minha empresa.')
  form.set('abrangencia', 'SP')
  return form
}

async function atribuicoesDe(usuarioId: string) {
  return db
    .select()
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.usuarioId, usuarioId))
}

/** Um interesse real de um lead indicado por João. */
async function interesseIndicado(nome: string, categoria: string) {
  const navegador = await visitarLink(joao.codigo)
  const { usuarioId, sessao } = await cadastrar(nome, navegador)
  definirCookie(COOKIE_INDICACAO, navegador)
  entrarComo(sessao)
  const r = await criarOportunidade(formulario(categoria))
  expect(r.sucesso).toBe(true)
  limparCookies()
  sairDaSessao()
  return { usuarioId, navegador, sessao }
}

describe('configuração do Gestor', () => {
  it('define o prazo padrão e registra na trilha de auditoria', async () => {
    entrarComo(contas.gestor.token)
    const r = await definirPrazoPadraoDeParceiro({ dias: 45 })
    expect(r.sucesso).toBe(true)

    expect((await obterPrazoVigente(null)).dias).toBe(45)
    expect((await obterPrazoVigente(null)).origem).toBe('padrao')

    const [evento] = await db
      .select()
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.acao, ACOES_AUDITORIA.prazoParceiroAlterado),
          eq(eventosAuditoria.autorId, contas.gestor.id),
        ),
      )
    expect(evento.entidade).toBe('parceiro_prazo_padrao')
    expect(evento.metadados).toMatchObject({
      escopo: 'padrao',
      valorAnterior: null,
      valorNovo: '45',
    })
    expect(evento.createdAt).toBeInstanceOf(Date)
  })

  it('define prazo por serviço, com valor anterior na trilha', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 90 })

    expect((await obterPrazoVigente('contabilidade')).dias).toBe(90)
    expect((await obterPrazoVigente('contabilidade')).origem).toBe('servico')

    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.entidade, 'parceiro_prazo_servico'))
    expect(eventos).toHaveLength(2)
    expect(eventos[1].metadados).toMatchObject({
      escopo: 'servico',
      servico: 'contabilidade',
      valorAnterior: 60,
      valorNovo: 90,
    })
  })

  it('serviço sem prazo próprio cai no padrão', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoPadraoDeParceiro({ dias: 20 })
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })

    expect((await obterPrazoVigente('advocacia')).dias).toBe(20)
    expect((await obterPrazoVigente('advocacia')).origem).toBe('padrao')
  })

  it('sem nada configurado, vale o ponto de partida embutido', async () => {
    const prazo = await obterPrazoVigente('contabilidade')
    expect(prazo.dias).toBe(CONFIGURACOES[CHAVE_PRAZO_PARCEIRO].padrao)
    expect(prazo.origem).toBe('embutido')
  })

  it('recusa zero, negativo, fracionado e absurdo', async () => {
    entrarComo(contas.gestor.token)
    for (const dias of [0, -1, 1.5, 99999]) {
      expect((await definirPrazoPadraoDeParceiro({ dias })).sucesso).toBe(false)
      expect(
        (await definirPrazoDoServico({ referencia: 'contabilidade', dias })).sucesso,
      ).toBe(false)
    }
    expect(await db.select().from(parceiroPrazos)).toHaveLength(0)
  })

  it('recusa serviço desconhecido', async () => {
    entrarComo(contas.gestor.token)
    const r = await definirPrazoDoServico({ referencia: 'inventado', dias: 10 })
    expect(r.sucesso).toBe(false)
    expect(await db.select().from(parceiroPrazos)).toHaveLength(0)
  })

  it('só o Gestor configura', async () => {
    for (const chave of ['clienteComum', 'pedro'] as const) {
      entrarComo(contas[chave].token)
      expect((await definirPrazoPadraoDeParceiro({ dias: 10 })).sucesso).toBe(false)
      expect(
        (await definirPrazoDoServico({ referencia: 'contabilidade', dias: 10 })).sucesso,
      ).toBe(false)
    }
    sairDaSessao()
    expect((await definirPrazoPadraoDeParceiro({ dias: 10 })).sucesso).toBe(false)
    expect(await db.select().from(parceiroPrazos)).toHaveLength(0)
  })
})

describe('leitura tolerante — não derruba fluxo crítico', () => {
  it('valor corrompido cai no degrau seguinte em vez de lançar', async () => {
    await db.insert(configuracoesPlataforma).values({
      chave: CHAVE_PRAZO_PARCEIRO,
      valor: 'nao-e-numero',
    })
    const prazo = await obterPrazoVigente('contabilidade')
    expect(prazo.dias).toBe(CONFIGURACOES[CHAVE_PRAZO_PARCEIRO].padrao)
    expect(prazo.origem).toBe('embutido')
  })

  it('com configuração corrompida, a oportunidade continua nascendo', async () => {
    await db.insert(configuracoesPlataforma).values({
      chave: CHAVE_PRAZO_PARCEIRO,
      valor: '-999',
    })
    const { usuarioId } = await interesseIndicado('Carlos Corrompido', 'contabilidade')

    const [oportunidade] = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, usuarioId))
    expect(oportunidade).toBeDefined()

    const [atribuicao] = await atribuicoesDe(usuarioId)
    expect(atribuicao.prazoDias).toBe(CONFIGURACOES[CHAVE_PRAZO_PARCEIRO].padrao)
  })
})

describe('congelamento', () => {
  it('o interesse usa o prazo vigente e o guarda na linha', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })
    sairDaSessao()

    const { usuarioId } = await interesseIndicado('Carlos Congela', 'contabilidade')
    const [atribuicao] = await atribuicoesDe(usuarioId)

    expect(atribuicao.prazoDias).toBe(60)
    expect(atribuicao.expiraEm).not.toBeNull()
    const esperado = calcularExpiracao(atribuicao.createdAt, 60)
    expect(
      Math.abs(atribuicao.expiraEm!.getTime() - esperado.getTime()),
    ).toBeLessThan(2000)
  })

  it('mudar a configuração depois não mexe no registro antigo', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })
    sairDaSessao()

    const antigo = await interesseIndicado('Carlos Antigo', 'contabilidade')
    const [antes] = await atribuicoesDe(antigo.usuarioId)

    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 90 })
    sairDaSessao()

    const [depois] = await atribuicoesDe(antigo.usuarioId)
    expect(depois.prazoDias).toBe(60)
    expect(depois.expiraEm!.getTime()).toBe(antes.expiraEm!.getTime())

    // Só o novo registro nasce com 90.
    const novo = await interesseIndicado('Carlos Novo', 'contabilidade')
    const [doNovo] = await atribuicoesDe(novo.usuarioId)
    expect(doNovo.prazoDias).toBe(90)
  })

  it('o histórico guarda sob qual prazo a indicação nasceu', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })
    sairDaSessao()

    await interesseIndicado('Carlos Historico', 'contabilidade')
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    const interesse = indicacao.eventos.find((e) => e.tipo === 'demonstrou_interesse')!
    expect(interesse.dados).toMatchObject({
      servico: 'contabilidade',
      prazoDias: 60,
      origemDoPrazo: 'servico',
    })
  })
})

describe('o mesmo lead com prazos diferentes por serviço', () => {
  it('Contabilidade e Advocacia recebem janelas distintas', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 60 })
    await definirPrazoDoServico({ referencia: 'advocacia', dias: 10 })
    sairDaSessao()

    const { usuarioId, navegador, sessao } = await interesseIndicado(
      'Carlos Dois Servicos',
      'contabilidade',
    )
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    expect((await criarOportunidade(formulario('advocacia'))).sucesso).toBe(true)
    limparCookies()
    sairDaSessao()

    const atribuicoes = await atribuicoesDe(usuarioId)
    expect(atribuicoes).toHaveLength(2)

    const contabil = atribuicoes.find((a) => a.servicoReferencia === 'contabilidade')!
    const juridico = atribuicoes.find((a) => a.servicoReferencia === 'advocacia')!
    expect(contabil.prazoDias).toBe(60)
    expect(juridico.prazoDias).toBe(10)
    expect(juridico.expiraEm!.getTime()).toBeLessThan(contabil.expiraEm!.getTime())

    // A tela do parceiro recebe os dois negócios, com prazo próprio cada um.
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.negocios).toHaveLength(2)
    expect(indicacao.negocios.map((n) => n.prazoDias).sort()).toEqual([10, 60])
  })
})

describe('validade e situação', () => {
  it('calcula expiração, dias restantes e situação', () => {
    const inicio = new Date('2026-09-01T12:00:00Z')
    const fim = calcularExpiracao(inicio, 10)
    expect(fim.toISOString()).toBe('2026-09-11T12:00:00.000Z')

    expect(diasRestantes(fim, new Date('2026-09-04T12:00:00Z'))).toBe(7)
    expect(diasRestantes(fim, new Date('2026-09-11T11:00:00Z'))).toBe(1)
    expect(diasRestantes(fim, new Date('2026-09-12T00:00:00Z'))).toBe(0)

    expect(situacaoDaAtribuicao(fim, new Date('2026-09-04T12:00:00Z'))).toBe('ativa')
    expect(situacaoDaAtribuicao(fim, new Date('2026-09-12T00:00:00Z'))).toBe('expirada')
    expect(situacaoDaAtribuicao(null)).toBe('sem_prazo')
  })

  it('atribuição vencida continua no histórico do parceiro', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 1 })
    sairDaSessao()

    const { usuarioId } = await interesseIndicado('Carlos Vencido', 'contabilidade')
    // Empurra o vencimento para o passado — é o relógio, não uma ação de alguém.
    await db
      .update(parceiroAtribuicoes)
      .set({ expiraEm: new Date(Date.now() - 86_400_000) })
      .where(eq(parceiroAtribuicoes.usuarioId, usuarioId))

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.negocios).toHaveLength(1)
    expect(situacaoDaAtribuicao(indicacao.negocios[0].expiraEm)).toBe('expirada')
    // Nada foi apagado: lead, ciclo e histórico continuam inteiros.
    expect(indicacao.lead?.nome).toBe('Carlos Vencido')
    expect(indicacao.eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
      'demonstrou_interesse',
    ])
  })
})

describe('nada do que já existia mudou', () => {
  it('oportunidade sem parceiro continua sem prazo e sem atribuição', async () => {
    entrarComo(contas.clienteComum.token)
    expect((await criarOportunidade(formulario('contabilidade'))).sucesso).toBe(true)
    expect(await atribuicoesDe(contas.clienteComum.id)).toHaveLength(0)
  })

  it('o prazo do parceiro não mexe no prazo da oportunidade', async () => {
    entrarComo(contas.gestor.token)
    await definirPrazoDoServico({ referencia: 'contabilidade', dias: 90 })
    sairDaSessao()

    const { usuarioId } = await interesseIndicado('Carlos Prazos', 'contabilidade')
    const [oportunidade] = await db
      .select({ expiraEm: oportunidades.expiraEm })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, usuarioId))

    // A oportunidade segue com o prazo dela, em horas — são dois relógios.
    const horas = (oportunidade.expiraEm!.getTime() - Date.now()) / 3_600_000
    expect(horas).toBeLessThan(24 * 30)
  })

  it('acesso de cliente, profissional e gestor segue igual', async () => {
    for (const chave of ['clienteComum', 'pedro', 'gestor'] as const) {
      const antes = await resolverAcessoUsuario(contas[chave].id)
      entrarComo(contas.gestor.token)
      await definirPrazoPadraoDeParceiro({ dias: 33 })
      sairDaSessao()
      expect(await resolverAcessoUsuario(contas[chave].id)).toEqual(antes)
    }
  })

  it('comissão existe, mas pagamento ao parceiro não', async () => {
    /*
      A comissão avulsa virou direito real e tem tabela própria. O que continua
      não existindo é o dinheiro saindo: saque, saldo, extrato e contas a pagar
      são outra conversa, com outras regras, e nenhuma tabela aqui as antecipa.
    */
    const linhas = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and (table_name like '%saque%'
          or table_name like '%extrato%'
          or table_name like '%parceiro_pagamento%')
    `)
    expect([...linhas]).toHaveLength(0)
  })
})
