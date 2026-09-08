import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  oportunidadeArquivos,
  oportunidadeMensagens,
  oportunidades,
  parceiroAtribuicoes,
  parceiroEventos,
  parceiroIndicacoes,
  perfis,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { COOKIE_INDICACAO, detalheDoEvento } from '@/features/parceiros/constants/indicacao'
import { gerarTokenDeVisitante } from '@/features/parceiros/lib/visitante'
import { criarContas, limparContas } from './setup/contas-de-teste'
import {
  definirCookie,
  entrarComo,
  limparCookies,
  sairDaSessao,
} from './setup/sessao'

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
const { listarIndicacoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-indicacoes'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { criarOportunidade } = await import(
  '@/features/oportunidades/actions/oportunidades'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { POST } = await import('@/app/api/auth/cadastro/route')

const SUFIXO = '@parceiros.atribuicao.teste'
const SUFIXO_NOVOS = '@parceiros.atrib.novos.teste'
type Chave = 'joao' | 'maria' | 'clienteAntigo' | 'pedro' | 'gestor'

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
      clienteAntigo: { perfil: 'cliente' },
      pedro: { perfil: 'profissional', prestador: 'profissional' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119498',
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

  const oportunidadesDeles = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, donos))
  const idsOportunidades = oportunidadesDeles.map(({ id }) => id)

  if (idsOportunidades.length) {
    await db
      .delete(parceiroAtribuicoes)
      .where(inArray(parceiroAtribuicoes.oportunidadeId, idsOportunidades))
    await db
      .delete(oportunidadeMensagens)
      .where(inArray(oportunidadeMensagens.oportunidadeId, idsOportunidades))
    await db
      .delete(oportunidadeArquivos)
      .where(inArray(oportunidadeArquivos.oportunidadeId, idsOportunidades))
    await db.delete(oportunidades).where(inArray(oportunidades.id, idsOportunidades))
  }

  const ciclos = await db
    .select({ id: parceiroIndicacoes.id })
    .from(parceiroIndicacoes)
    .where(inArray(parceiroIndicacoes.parceiroId, [joao.id, maria.id]))
  const idsCiclos = ciclos.map(({ id }) => id)
  if (idsCiclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, idsCiclos))
    await db
      .update(parceiroIndicacoes)
      .set({ substituidaPorId: null })
      .where(inArray(parceiroIndicacoes.id, idsCiclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, idsCiclos))
  }

  // `criarOportunidade` grava trilha de auditoria: ela sai antes das contas.
  if (donos.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, donos))
  }

  if (idsNovos.length) {
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, idsNovos))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, idsNovos))
    await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, idsNovos))
    await db.delete(usuarios).where(inArray(usuarios.id, idsNovos))
  }
}

beforeEach(async () => {
  limparCookies()
  await limpar()
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

/** Cadastro pelo caminho real, carregando o cookie do navegador. */
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
      email: `atrib${indice}${SUFIXO_NOVOS}`,
      whatsapp: `1198874${String(3000 + indice)}`,
      senha: 'SenhaForte123!',
      confirmarSenha: 'SenhaForte123!',
      perfilTipo: 'cliente',
      aceitouTermos: true,
    }),
  })
  const { NextRequest } = await import('next/server')
  const resposta = await POST(new NextRequest(requisicao))
  const corpo = await resposta.json()
  const usuarioId = corpo?.dados?.usuarioId as string

  // Conta confirmada e com sessão: é o estado real de quem vai pedir orçamento.
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

/** Uma solicitação pública de orçamento — o marketplace. */
function formularioPublico(categoria = 'contabilidade') {
  const form = new FormData()
  form.set('categoria', categoria)
  form.set(
    'descricao',
    'Preciso de apoio contábil mensal para uma empresa de pequeno porte no Simples.',
  )
  form.set('abrangencia', 'SP')
  return form
}

async function atribuicaoDa(oportunidadeId: string) {
  const [linha] = await db
    .select()
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.oportunidadeId, oportunidadeId))
  return linha ?? null
}

async function ultimaOportunidadeDe(usuarioId: string) {
  const [linha] = await db
    .select({ id: oportunidades.id, categoria: oportunidades.categoria })
    .from(oportunidades)
    .where(eq(oportunidades.clienteUsuarioId, usuarioId))
  return linha
}

describe('oportunidade sem parceiro', () => {
  it('continua funcionando exatamente como antes', async () => {
    entrarComo(contas.clienteAntigo.token)
    const resultado = await criarOportunidade(formularioPublico())
    expect(resultado.sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(contas.clienteAntigo.id)
    expect(oportunidade).toBeDefined()
    expect(await atribuicaoDa(oportunidade.id)).toBeNull()
  })

  it('cliente sem indicação nenhuma não cria atribuição', async () => {
    const { usuarioId, sessao } = await cadastrar('Sem Origem')
    entrarComo(sessao)
    expect((await criarOportunidade(formularioPublico())).sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(usuarioId)
    expect(await atribuicaoDa(oportunidade.id)).toBeNull()
    const todas = await db.select().from(parceiroAtribuicoes)
    expect(todas).toHaveLength(0)
  })
})

describe('cliente vindo de João', () => {
  it('registra João como origem, com serviço e evento no histórico', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Atrib', navegador)

    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    expect((await criarOportunidade(formularioPublico())).sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(usuarioId)
    const atribuicao = await atribuicaoDa(oportunidade.id)

    expect(atribuicao).not.toBeNull()
    expect(atribuicao!.parceiroId).toBe(joao.id)
    expect(atribuicao!.usuarioId).toBe(usuarioId)
    expect(atribuicao!.servicoReferencia).toBe('contabilidade')
    // O cadastro já ligou o ciclo à conta: a origem vem dali, não do cookie.
    expect(atribuicao!.resolvidaPor).toBe('conta')

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
      'demonstrou_interesse',
    ])
    const interesse = indicacao.eventos.find((e) => e.tipo === 'demonstrou_interesse')!
    expect(detalheDoEvento(interesse.tipo, interesse.dados)).toBe('Contabilidade')
  })

  it('a origem sobrevive à troca de aparelho: sem cookie, vale a conta', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Celular', navegador)

    // Outro aparelho: nenhum cookie de indicação chega.
    entrarComo(sessao)
    expect((await criarOportunidade(formularioPublico())).sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(usuarioId)
    const atribuicao = await atribuicaoDa(oportunidade.id)
    expect(atribuicao!.parceiroId).toBe(joao.id)
    expect(atribuicao!.resolvidaPor).toBe('conta')
  })

  it('escolher um profissional do marketplace não muda a origem', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Privado', navegador)

    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    const form = formularioPublico()
    // Solicitação dirigida ao Pedro — o parceiro não escolheu profissional.
    form.set('destinatarioId', contas.pedro.id)
    expect((await criarOportunidade(form)).sucesso).toBe(true)

    const [oportunidade] = await db
      .select({
        id: oportunidades.id,
        destinatarioId: oportunidades.destinatarioId,
        visibilidade: oportunidades.visibilidade,
      })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, usuarioId))

    expect(oportunidade.destinatarioId).toBe(contas.pedro.id)
    expect(oportunidade.visibilidade).toBe('privada')

    const atribuicao = await atribuicaoDa(oportunidade.id)
    expect(atribuicao!.parceiroId).toBe(joao.id)
  })
})

describe('a atribuição é do negócio; o cliente da base não é recapturado', () => {
  it('cada negócio tem a sua linha, e todas continuam sob João', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Dois', navegador)

    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico('contabilidade'))
    const primeira = (await ultimaOportunidadeDe(usuarioId)).id

    // Agora Carlos chega pelo link de Maria, no mesmo navegador. Ele já é da
    // base Vincis: o clique registra o acesso, mas não transfere nada.
    await visitarLink(maria.codigo, navegador)
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico('advocacia'))

    const todas = await db
      .select({ id: oportunidades.id, categoria: oportunidades.categoria })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, usuarioId))
    expect(todas).toHaveLength(2)

    const segunda = todas.find((o) => o.id !== primeira)!
    const daPrimeira = await atribuicaoDa(primeira)
    const daSegunda = await atribuicaoDa(segunda.id)

    // Duas linhas, dois serviços, dois prazos próprios — um só parceiro.
    expect(daPrimeira!.parceiroId).toBe(joao.id)
    expect(daPrimeira!.servicoReferencia).toBe('contabilidade')
    expect(daSegunda!.parceiroId).toBe(joao.id)
    expect(daSegunda!.servicoReferencia).toBe('advocacia')
    expect(daSegunda!.indicacaoId).toBe(daPrimeira!.indicacaoId)

    // Maria registrou o acesso e nada mais: nenhum negócio, nenhum lead.
    const deMaria = await listarIndicacoesDoParceiro(maria.id)
    expect(deMaria).toHaveLength(1)
    expect(deMaria[0].lead).toBeNull()
    expect(deMaria[0].negocios).toEqual([])
    expect(deMaria[0].eventos.map((e) => e.tipo)).toEqual(['acessou_link'])

    // O histórico de João continua inteiro, com os dois interesses.
    const deJoao = await listarIndicacoesDoParceiro(joao.id)
    expect(deJoao).toHaveLength(1)
    expect(deJoao[0].lead?.nome).toBe('Carlos Dois')
    expect(deJoao[0].negocios).toHaveLength(2)
    expect(deJoao[0].eventos.map((e) => e.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
      'demonstrou_interesse',
      'demonstrou_interesse',
    ])
  })

  it('expirar a atribuição não devolve o cliente ao mercado', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Expirado', navegador)

    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico('contabilidade'))
    const primeira = (await ultimaOportunidadeDe(usuarioId)).id

    // A janela comercial da primeira atribuição já passou.
    await db
      .update(parceiroAtribuicoes)
      .set({ expiraEm: new Date(Date.now() - 86_400_000) })
      .where(eq(parceiroAtribuicoes.oportunidadeId, primeira))

    await visitarLink(maria.codigo, navegador)
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico('advocacia'))

    const [segunda] = (
      await db
        .select({ id: oportunidades.id })
        .from(oportunidades)
        .where(eq(oportunidades.clienteUsuarioId, usuarioId))
    ).filter((o) => o.id !== primeira)

    expect((await atribuicaoDa(segunda.id))!.parceiroId).toBe(joao.id)
    expect(
      await db
        .select()
        .from(parceiroAtribuicoes)
        .where(eq(parceiroAtribuicoes.parceiroId, maria.id)),
    ).toHaveLength(0)
  })

  it('cliente que já era da base não vira indicação de ninguém', async () => {
    // Ana tem conta antiga. Ela mesma clica no link de João, no navegador dela.
    const navegador = await visitarLink(joao.codigo)
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(contas.clienteAntigo.token)
    expect((await criarOportunidade(formularioPublico())).sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(contas.clienteAntigo.id)
    expect(await atribuicaoDa(oportunidade.id)).toBeNull()

    // O acesso ficou registrado; o ciclo continua anônimo e livre.
    const [ciclo] = await listarIndicacoesDoParceiro(joao.id)
    expect(ciclo.lead).toBeNull()
    expect(ciclo.eventos.map((e) => e.tipo)).toEqual(['acessou_link'])
  })

  it('uma oportunidade tem no máximo uma atribuição', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Unico', navegador)
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico())

    const oportunidade = await ultimaOportunidadeDe(usuarioId)
    const { registrarAtribuicaoDaOportunidade } = await import(
      '@/features/parceiros/lib/registrar-atribuicao'
    )
    // Repetir a operação não cria uma segunda linha nem um segundo evento.
    await db.transaction(async (tx) =>
      registrarAtribuicaoDaOportunidade(tx, {
        oportunidadeId: oportunidade.id,
        usuarioId,
        visitanteToken: navegador,
        servico: 'contabilidade',
      }),
    )

    const linhas = await db
      .select()
      .from(parceiroAtribuicoes)
      .where(eq(parceiroAtribuicoes.oportunidadeId, oportunidade.id))
    expect(linhas).toHaveLength(1)

    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(
      indicacao.eventos.filter((e) => e.tipo === 'demonstrou_interesse'),
    ).toHaveLength(1)
  })

  it('cookie de outra pessoa não sequestra o negócio', async () => {
    const navegadorDeCarlos = await visitarLink(joao.codigo)
    await cadastrar('Carlos Dono', navegadorDeCarlos)

    // Ana usa o mesmo computador, mas a conta dela é antiga e sem indicação.
    definirCookie(COOKIE_INDICACAO, navegadorDeCarlos)
    entrarComo(contas.clienteAntigo.token)
    expect((await criarOportunidade(formularioPublico())).sucesso).toBe(true)

    const oportunidade = await ultimaOportunidadeDe(contas.clienteAntigo.id)
    expect(await atribuicaoDa(oportunidade.id)).toBeNull()
  })
})

describe('nada do que já existia mudou', () => {
  it('a oportunidade nasce idêntica, com ou sem parceiro', async () => {
    const navegador = await visitarLink(joao.codigo)
    const comOrigem = await cadastrar('Com Origem', navegador)
    const semOrigem = await cadastrar('Sem Origem Dois')

    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(comOrigem.sessao)
    await criarOportunidade(formularioPublico())
    limparCookies()
    entrarComo(semOrigem.sessao)
    await criarOportunidade(formularioPublico())

    const colunas = {
      categoria: oportunidades.categoria,
      visibilidade: oportunidades.visibilidade,
      status: oportunidades.status,
      origem: oportunidades.origem,
      abrangencia: oportunidades.abrangencia,
      destinatarioId: oportunidades.destinatarioId,
    }
    const [a] = await db
      .select(colunas)
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, comOrigem.usuarioId))
    const [b] = await db
      .select(colunas)
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, semOrigem.usuarioId))

    // O parceiro não muda nada da solicitação — nem a origem dela.
    expect(a).toEqual(b)
    expect(a.origem).toBe('solicitacao')
  })

  it('prestador e Gestor continuam sem poder pedir orçamento', async () => {
    entrarComo(contas.pedro.token)
    const doPrestador = await criarOportunidade(formularioPublico())
    expect(doPrestador.sucesso).toBe(false)

    const nenhuma = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, contas.pedro.id))
    expect(nenhuma).toHaveLength(0)
  })

  it('acesso de cliente, profissional e gestor segue igual', async () => {
    for (const chave of ['clienteAntigo', 'pedro', 'gestor'] as const) {
      const antes = await resolverAcessoUsuario(contas[chave].id)
      const navegador = await visitarLink(joao.codigo)
      const { sessao } = await cadastrar('Alguem', navegador)
      definirCookie(COOKIE_INDICACAO, navegador)
      entrarComo(sessao)
      await criarOportunidade(formularioPublico())
      limparCookies()
      expect(await resolverAcessoUsuario(contas[chave].id)).toEqual(antes)
    }
  })

  it('nenhum perfil novo foi criado', async () => {
    const nomes = (await db.select({ nome: perfis.nome }).from(perfis)).map((p) => p.nome)
    expect(nomes).not.toContain('parceiro')
  })

  it('a atribuição não guarda nada de comissão', async () => {
    const navegador = await visitarLink(joao.codigo)
    const { usuarioId, sessao } = await cadastrar('Carlos Sem Comissao', navegador)
    definirCookie(COOKIE_INDICACAO, navegador)
    entrarComo(sessao)
    await criarOportunidade(formularioPublico())

    const oportunidade = await ultimaOportunidadeDe(usuarioId)
    const atribuicao = await atribuicaoDa(oportunidade.id)
    // `prazoDias`/`expiraEm` entraram depois e são tempo, não dinheiro: a
    // janela de validade da indicação não é comissão nem promessa de pagamento.
    const colunas = Object.keys(atribuicao!).join(' ').toLowerCase()
    for (const proibido of ['valor', 'percentual', 'comiss', 'saldo', 'pagamento']) {
      expect(colunas).not.toContain(proibido)
    }
  })
})
