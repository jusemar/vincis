import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  parceiroEventos,
  parceiroIndicacoes,
  perfis,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import { gerarTokenDeVisitante } from '@/features/parceiros/lib/visitante'
import { criarContas, limparContas } from './setup/contas-de-teste'
import {
  definirCookie,
  entrarComo,
  limparCookies,
  sairDaSessao,
} from './setup/sessao'

// Único ponto simulado: o provedor de e-mail. Cadastro, sessão e associação
// rodam de verdade contra o banco.
const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { ativarParceiro } = await import(
  '@/features/parceiros/actions/ativar-parceiro'
)
const { registrarAcessoPeloLink } = await import(
  '@/features/parceiros/lib/registrar-acesso'
)
const { associarIndicacaoAoCadastro } = await import(
  '@/features/parceiros/lib/associar-cadastro'
)
const { listarIndicacoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-indicacoes'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { cadastrarUsuario } = await import(
  '@/features/usuarios/actions/cadastrar-usuario'
)
const { POST } = await import('@/app/api/auth/cadastro/route')

const SUFIXO = '@parceiros.associacao.teste'
const SUFIXO_NOVOS = '@parceiros.novos.teste'
type Chave = 'joao' | 'maria' | 'antigo' | 'profissional' | 'gestor'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let maria: { id: string; codigo: string }
let indice = 0

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      maria: { perfil: 'cliente' },
      antigo: { perfil: 'cliente' },
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119497',
  )) as Record<Chave, { id: string; token: string }>

  for (const chave of ['joao', 'maria'] as const) {
    entrarComo(contas[chave].token)
    await ativarParceiro()
  }
  sairDaSessao()

  joao = (await obterParceiroDoUsuario(contas.joao.id))!
  maria = (await obterParceiroDoUsuario(contas.maria.id))!
})

afterAll(async () => {
  sairDaSessao()
  limparCookies()
  await limparNovos()
  await limparContas(SUFIXO)
})

async function limparNovos() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO_NOVOS}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

beforeEach(async () => {
  limparCookies()
  const meus = await db
    .select({ id: parceiroIndicacoes.id })
    .from(parceiroIndicacoes)
    .where(inArray(parceiroIndicacoes.parceiroId, [joao.id, maria.id]))
  const ids = meus.map(({ id }) => id)
  if (ids.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ids))
    await db
      .update(parceiroIndicacoes)
      .set({ substituidaPorId: null })
      .where(inArray(parceiroIndicacoes.id, ids))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ids))
  }
  await limparNovos()
})

afterEach(() => {
  limparCookies()
  sairDaSessao()
})

/** Um visitante anônimo chegando pelo link. Devolve o cookie do navegador. */
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

/** Cadastro pelo caminho REAL — a rota que o ModalCadastro chama. */
async function cadastrarPelaRota(nome: string, navegador?: string) {
  indice += 1
  const email = `novo${indice}${SUFIXO_NOVOS}`
  const requisicao = new Request('https://vincis.test/api/auth/cadastro', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(navegador ? { cookie: `${COOKIE_INDICACAO}=${navegador}` } : {}),
    },
    body: JSON.stringify({
      nome,
      email,
      whatsapp: `1198876${String(1000 + indice)}`,
      senha: 'SenhaForte123!',
      confirmarSenha: 'SenhaForte123!',
      perfilTipo: 'cliente',
      aceitouTermos: true,
    }),
  })
  const { NextRequest } = await import('next/server')
  const resposta = await POST(new NextRequest(requisicao))
  const corpo = await resposta.json()
  return { status: resposta.status, corpo, email }
}

describe('cenário A — visitante anônimo vira lead identificado', () => {
  it('associa a indicação ao novo usuário e grava o evento de cadastro', async () => {
    const navegador = await visitarLink(joao.codigo)

    const antes = await listarIndicacoesDoParceiro(joao.id)
    expect(antes[0].lead).toBeNull()
    expect(antes[0].eventos.map((e) => e.tipo)).toEqual(['acessou_link'])

    const { status, corpo } = await cadastrarPelaRota('Carlos Teste', navegador)
    expect(status).toBe(201)
    expect(corpo.sucesso).toBe(true)

    const depois = await listarIndicacoesDoParceiro(joao.id)
    expect(depois).toHaveLength(1)
    expect(depois[0].lead?.nome).toBe('Carlos Teste')
    // O histórico continua desde o primeiro acesso, em ordem cronológica.
    expect(depois[0].eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
    ])
  })

  it('a tela recebe nome, e-mail e WhatsApp — e nada além disso', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { email } = await cadastrarPelaRota('Carlos Teste', navegador)

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(Object.keys(indicacao.lead!).sort()).toEqual(
      ['criadoEm', 'email', 'nome', 'whatsapp'].sort(),
    )
    expect(indicacao.lead!.email).toBe(email)
    expect(indicacao.lead!.whatsapp).toMatch(/^1198876/)

    const serializado = JSON.stringify(indicacao)
    for (const proibido of ['senha', 'Hash', 'hash', 'token', 'userAgent', 'status']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  it('a conta é sempre posterior ao acesso que a originou', async () => {
    const navegador = await visitarLink(joao.codigo)
    await cadastrarPelaRota('Carlos Teste', navegador)
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead!.criadoEm.getTime()).toBeGreaterThanOrEqual(
      indicacao.criadoEm.getTime(),
    )
  })

  it('cadastro sem nenhuma indicação no navegador não associa nada', async () => {
    const { status } = await cadastrarPelaRota('Sem Indicacao')
    expect(status).toBe(201)
    expect(await listarIndicacoesDoParceiro(joao.id)).toHaveLength(0)
  })
})

describe('cenário B — quem já era da base não é captado', () => {
  it('conta anterior à indicação é recusada, com o motivo por data', async () => {
    // A conta `antigo` foi criada no `beforeAll`; a indicação nasce agora.
    const navegador = await visitarLink(joao.codigo)

    const resultado = await associarIndicacaoAoCadastro({
      usuarioId: contas.antigo.id,
      visitanteToken: navegador,
    })

    expect(resultado).toEqual({
      associou: false,
      motivo: 'conta-anterior-a-indicacao',
    })

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead).toBeNull()
    expect(indicacao.eventos.map((e) => e.tipo)).toEqual(['acessou_link'])
  })

  it('usuário existente que clica no link não vira lead captado', async () => {
    // O acesso é registrado — é um fato —, mas nenhum cadastro acontece, então
    // nenhuma associação roda e a indicação segue anônima.
    await visitarLink(joao.codigo)
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead).toBeNull()

    const [linha] = await db
      .select({ usuarioId: parceiroIndicacoes.usuarioId })
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.id, indicacao.id))
    expect(linha.usuarioId).toBeNull()
  })
})

describe('cenário C — Maria substitui João antes do cadastro', () => {
  it('o cadastro fica só com a indicação atual, e a de João permanece', async () => {
    const navegador = await visitarLink(joao.codigo)
    await visitarLink(maria.codigo, navegador)

    await cadastrarPelaRota('Carlos Teste', navegador)

    const deJoao = await listarIndicacoesDoParceiro(joao.id)
    const deMaria = await listarIndicacoesDoParceiro(maria.id)

    // João continua no histórico, fechado, anônimo e com o evento dele.
    expect(deJoao).toHaveLength(1)
    expect(deJoao[0].substituidaEm).not.toBeNull()
    expect(deJoao[0].lead).toBeNull()
    expect(deJoao[0].eventos.map((e) => e.tipo)).toEqual(['acessou_link'])

    // Maria é quem recebe o cadastro.
    expect(deMaria).toHaveLength(1)
    expect(deMaria[0].substituidaEm).toBeNull()
    expect(deMaria[0].lead?.nome).toBe('Carlos Teste')
    expect(deMaria[0].eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
    ])
  })
})

describe('idempotência e integridade da associação', () => {
  it('repetir a associação não duplica evento nem troca nada', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { corpo } = await cadastrarPelaRota('Carlos Teste', navegador)
    const usuarioId = corpo.dados.usuarioId

    const repetida = await associarIndicacaoAoCadastro({ usuarioId, visitanteToken: navegador })
    expect(repetida).toEqual({ associou: false, motivo: 'ja-associado' })

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.eventos.filter((e) => e.tipo === 'cadastrou_conta')).toHaveLength(1)
  })

  it('não troca o dono de um ciclo já associado a outra conta', async () => {
    const navegador = await visitarLink(joao.codigo)
    const primeiro = await cadastrarPelaRota('Primeiro Teste', navegador)

    // Segunda conta criada no mesmo navegador: o ciclo já tem dono.
    const segundo = await cadastrarPelaRota('Segundo Teste', navegador)
    expect(segundo.status).toBe(201)

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead?.nome).toBe('Primeiro Teste')
    expect(indicacao.eventos.filter((e) => e.tipo === 'cadastrou_conta')).toHaveLength(1)
    expect(primeiro.corpo.dados.usuarioId).toBeDefined()
  })

  it('duas associações simultâneas gravam um evento só', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { corpo } = await cadastrarPelaRota('Carlos Teste')
    const usuarioId = corpo.dados.usuarioId

    await Promise.all([
      associarIndicacaoAoCadastro({ usuarioId, visitanteToken: navegador }),
      associarIndicacaoAoCadastro({ usuarioId, visitanteToken: navegador }),
    ])

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead).not.toBeNull()
    expect(indicacao.eventos.filter((e) => e.tipo === 'cadastrou_conta')).toHaveLength(1)
  })

  it('token de visitante inválido ou ausente não associa nada', async () => {
    await visitarLink(joao.codigo)
    const { corpo } = await cadastrarPelaRota('Carlos Teste')
    const usuarioId = corpo.dados.usuarioId

    for (const invalido of [undefined, '', 'abc', 'z'.repeat(64)]) {
      expect(
        await associarIndicacaoAoCadastro({ usuarioId, visitanteToken: invalido }),
      ).toEqual({ associou: false, motivo: 'sem-indicacao' })
    }
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead).toBeNull()
  })

  it('navegador sem ciclo aberto não associa nada', async () => {
    const { corpo } = await cadastrarPelaRota('Carlos Teste')
    expect(
      await associarIndicacaoAoCadastro({
        usuarioId: corpo.dados.usuarioId,
        visitanteToken: gerarTokenDeVisitante(),
      }),
    ).toEqual({ associou: false, motivo: 'sem-ciclo-aberto' })
  })

  it('código inválido não gera indicação nem associação', async () => {
    const navegador = await visitarLink('zzzzzzzz')
    const { status } = await cadastrarPelaRota('Carlos Teste', navegador)
    expect(status).toBe(201)
    expect(await listarIndicacoesDoParceiro(joao.id)).toHaveLength(0)
    expect(await listarIndicacoesDoParceiro(maria.id)).toHaveLength(0)
  })
})

describe('os dois caminhos de cadastro concordam', () => {
  it('a Server Action associa igual à rota', async () => {
    const navegador = await visitarLink(maria.codigo)
    // A action lê o cookie por `next/headers`, como em produção.
    definirCookie(COOKIE_INDICACAO, navegador)

    indice += 1
    const resultado = await cadastrarUsuario({
      nome: 'Carlos Action',
      email: `acao${indice}${SUFIXO_NOVOS}`,
      whatsapp: `1198875${String(2000 + indice)}`,
      senha: 'SenhaForte123!',
      confirmarSenha: 'SenhaForte123!',
      perfilTipo: 'cliente',
      aceitouTermos: true,
    })
    expect(resultado.sucesso).toBe(true)

    const [indicacao] = await listarIndicacoesDoParceiro(maria.id)
    expect(indicacao.lead?.nome).toBe('Carlos Action')
    expect(indicacao.eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
    ])
  })
})

describe('nada do que já existia mudou', () => {
  it('o cadastro segue funcionando sem programa de indicação', async () => {
    const { status, corpo } = await cadastrarPelaRota('Comum Teste')
    expect(status).toBe(201)
    expect(corpo.sucesso).toBe(true)
    expect(enviarEmailConfirmacao).toHaveBeenCalled()

    const [criado] = await db
      .select({ status: usuarios.status, emailVerificado: usuarios.emailVerificado })
      .from(usuarios)
      .where(eq(usuarios.id, corpo.dados.usuarioId))
    expect(criado.status).toBe('pendente_email')
    expect(criado.emailVerificado).toBe(false)

    const vinculos = await db
      .select({ perfilId: usuariosPerfis.perfilId })
      .from(usuariosPerfis)
      .where(eq(usuariosPerfis.usuarioId, corpo.dados.usuarioId))
    expect(vinculos).toHaveLength(1)
  })

  it('e-mail duplicado continua sendo recusado com 409', async () => {
    const primeiro = await cadastrarPelaRota('Carlos Teste')
    const requisicao = new Request('https://vincis.test/api/auth/cadastro', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome: 'Outro',
        email: primeiro.email,
        whatsapp: '11988879999',
        senha: 'SenhaForte123!',
        confirmarSenha: 'SenhaForte123!',
        perfilTipo: 'cliente',
        aceitouTermos: true,
      }),
    })
    const { NextRequest } = await import('next/server')
    const resposta = await POST(new NextRequest(requisicao))
    expect(resposta.status).toBe(409)
  })

  it('associação não altera usuário, perfis nem acesso de ninguém', async () => {
    const antesUsuarios = await db
      .select({ id: usuarios.id, nome: usuarios.nome, status: usuarios.status })
      .from(usuarios)
      .where(inArray(usuarios.id, [contas.joao.id, contas.profissional.id, contas.gestor.id]))
    const acessosAntes = await Promise.all(
      (['joao', 'profissional', 'gestor'] as const).map((c) =>
        resolverAcessoUsuario(contas[c].id),
      ),
    )

    const navegador = await visitarLink(joao.codigo)
    await cadastrarPelaRota('Carlos Teste', navegador)

    const depoisUsuarios = await db
      .select({ id: usuarios.id, nome: usuarios.nome, status: usuarios.status })
      .from(usuarios)
      .where(inArray(usuarios.id, [contas.joao.id, contas.profissional.id, contas.gestor.id]))
    expect(depoisUsuarios).toEqual(antesUsuarios)

    const acessosDepois = await Promise.all(
      (['joao', 'profissional', 'gestor'] as const).map((c) =>
        resolverAcessoUsuario(contas[c].id),
      ),
    )
    expect(acessosDepois).toEqual(acessosAntes)

    const perfisExistentes = await db.select({ nome: perfis.nome }).from(perfis)
    expect(perfisExistentes.some(({ nome }) => nome === 'parceiro')).toBe(false)
  })
})
