import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  parceiros,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import {
  COOKIE_INDICACAO,
  DIAS_COOKIE_INDICACAO,
  rotuloDoEvento,
} from '@/features/parceiros/constants/indicacao'
import {
  dadosTecnicosDoAcesso,
  gerarTokenDeVisitante,
  hashDoVisitante,
  tokenDeVisitanteValido,
} from '@/features/parceiros/lib/visitante'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

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
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { GET } = await import('@/app/p/[codigo]/route')

const SUFIXO = '@parceiros.indicacoes.teste'
type Chave = 'joao' | 'maria' | 'profissional' | 'gestor'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let maria: { id: string; codigo: string }

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      maria: { perfil: 'cliente' },
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119496',
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
  await limparContas(SUFIXO)
})

beforeEach(async () => {
  const meus = await db
    .select({ id: parceiroIndicacoes.id })
    .from(parceiroIndicacoes)
    .where(inArray(parceiroIndicacoes.parceiroId, [joao.id, maria.id]))
  const ids = meus.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ids))
  await db
    .update(parceiroIndicacoes)
    .set({ substituidaPorId: null })
    .where(inArray(parceiroIndicacoes.id, ids))
  await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ids))
})

/** Uma requisição de verdade para a rota do link. */
async function acessarLink(
  codigo: string,
  cookie?: string,
  cabecalhos: Record<string, string> = {},
) {
  const requisicao = new Request(`https://vincis.test/p/${codigo}`, {
    headers: {
      ...(cookie ? { cookie: `${COOKIE_INDICACAO}=${cookie}` } : {}),
      ...cabecalhos,
    },
    redirect: 'manual',
  })
  // `NextRequest` aceita a Request padrão; a rota só lê cookies e cabeçalhos.
  const { NextRequest } = await import('next/server')
  const resposta = await GET(new NextRequest(requisicao), {
    params: Promise.resolve({ codigo }),
  })
  return {
    status: resposta.status,
    destino: resposta.headers.get('location'),
    setCookie: resposta.headers.get('set-cookie'),
    cookie: resposta.cookies.get(COOKIE_INDICACAO)?.value ?? null,
  }
}

describe('identificador do visitante', () => {
  it('é opaco: sorteio puro, sem usuário nem parceiro dentro', () => {
    const token = gerarTokenDeVisitante()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(token).not.toContain(contas.joao.id.replace(/-/g, ''))
    expect(token).not.toContain(joao.id.replace(/-/g, ''))
    expect(token).not.toContain(joao.codigo)
    expect(gerarTokenDeVisitante()).not.toBe(token)
  })

  it('o banco guarda o hash, nunca o valor que o navegador apresenta', async () => {
    const token = gerarTokenDeVisitante()
    await registrarAcessoPeloLink({
      codigo: joao.codigo,
      visitanteToken: token,
      userAgent: null,
      referenciaHost: null,
    })
    const [linha] = await db
      .select({ hash: parceiroIndicacoes.visitanteHash })
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.parceiroId, joao.id))
    expect(linha.hash).toBe(hashDoVisitante(token))
    expect(linha.hash).not.toBe(token)
  })

  it('recusa token que não tem a forma gerada por nós', () => {
    expect(tokenDeVisitanteValido(undefined)).toBe(false)
    expect(tokenDeVisitanteValido('')).toBe(false)
    expect(tokenDeVisitanteValido('abc')).toBe(false)
    expect(tokenDeVisitanteValido('x'.repeat(64))).toBe(false)
    expect(tokenDeVisitanteValido(gerarTokenDeVisitante())).toBe(true)
  })

  it('coleta técnica é mínima: sem IP, sem URL inteira do referenciador', () => {
    const dados = dadosTecnicosDoAcesso({
      userAgent: 'Mozilla/5.0',
      referer: 'https://www.instagram.com/p/abc123/?utm_source=bio',
    })
    expect(dados.referenciaHost).toBe('www.instagram.com')
    expect(dados.userAgent).toBe('Mozilla/5.0')
    expect(Object.keys(dados)).toEqual(['userAgent', 'referenciaHost'])
  })

  it('referenciador ilegível vira ausência, não erro', () => {
    expect(dadosTecnicosDoAcesso({ userAgent: null, referer: 'nao-e-url' }))
      .toEqual({ userAgent: null, referenciaHost: null })
  })
})

describe('acesso pelo link', () => {
  it('código válido registra ciclo, evento e redireciona para a home', async () => {
    const r = await acessarLink(joao.codigo, undefined, {
      'user-agent': 'Mozilla/5.0 (teste)',
      referer: 'https://wa.me/',
    })
    expect(r.status).toBe(307)
    expect(new URL(r.destino!).pathname).toBe('/')

    const indicacoes = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacoes).toHaveLength(1)
    expect(indicacoes[0].origem).toBe('link_indicacao')
    expect(indicacoes[0].substituidaEm).toBeNull()
    expect(indicacoes[0].eventos.map((e) => e.tipo)).toEqual(['acessou_link'])
    expect(rotuloDoEvento(indicacoes[0].eventos[0].tipo)).toBe(
      'Acessou pelo seu link',
    )
  })

  it('guarda os dados técnicos permitidos e nenhum IP', async () => {
    await acessarLink(joao.codigo, undefined, {
      'user-agent': 'Mozilla/5.0 (teste)',
      referer: 'https://www.instagram.com/vincis/',
      'x-forwarded-for': '203.0.113.9',
    })
    const [linha] = await db
      .select()
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.parceiroId, joao.id))
    expect(linha.userAgent).toBe('Mozilla/5.0 (teste)')
    expect(linha.referenciaHost).toBe('www.instagram.com')
    expect(Object.keys(linha)).not.toContain('ip')
    expect(JSON.stringify(linha)).not.toContain('203.0.113.9')
  })

  it('o cookie é first-party, HttpOnly, Lax e com validade técnica declarada', async () => {
    const r = await acessarLink(joao.codigo)
    expect(r.setCookie).toContain('HttpOnly')
    expect(r.setCookie).toContain('SameSite=lax')
    expect(r.setCookie).toContain(`Max-Age=${DIAS_COOKIE_INDICACAO * 24 * 60 * 60}`)
    expect(r.setCookie).toContain('Path=/')
    // Nada legível dentro: nem conta, nem parceiro, nem código.
    expect(r.cookie).toMatch(/^[0-9a-f]{64}$/)
    expect(r.setCookie).not.toContain(joao.codigo)
    expect(r.setCookie).not.toContain(contas.joao.id)
  })

  it('código inexistente não grava nada, não vaza e não escreve cookie', async () => {
    const antes = await db.select({ id: parceiroIndicacoes.id }).from(parceiroIndicacoes)
    const r = await acessarLink('zzzzzzzz')
    expect(r.status).toBe(307)
    expect(new URL(r.destino!).pathname).toBe('/')
    expect(r.cookie).toBeNull()
    const depois = await db.select({ id: parceiroIndicacoes.id }).from(parceiroIndicacoes)
    expect(depois).toHaveLength(antes.length)
  })

  it('código malformado não quebra o site nem consulta o banco', async () => {
    for (const invalido of ['', 'abc', '../../etc', 'CÓDIGO!', 'a'.repeat(200)]) {
      const r = await acessarLink(encodeURIComponent(invalido))
      expect(r.status).toBe(307)
      expect(new URL(r.destino!).pathname).toBe('/')
    }
    expect(await listarIndicacoesDoParceiro(joao.id)).toHaveLength(0)
  })

  it('o mesmo navegador clicando de novo no mesmo link não duplica o ciclo', async () => {
    const primeira = await acessarLink(joao.codigo)
    await acessarLink(joao.codigo, primeira.cookie!)
    await acessarLink(joao.codigo, primeira.cookie!)

    const indicacoes = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacoes).toHaveLength(1)
    // Mas cada acesso é um fato, e o histórico registra os três.
    expect(indicacoes[0].eventos).toHaveLength(3)
  })

  it('dois acessos simultâneos deixam um só ciclo aberto', async () => {
    const token = gerarTokenDeVisitante()
    await Promise.all([
      registrarAcessoPeloLink({ codigo: joao.codigo, visitanteToken: token, userAgent: null, referenciaHost: null }),
      registrarAcessoPeloLink({ codigo: joao.codigo, visitanteToken: token, userAgent: null, referenciaHost: null }),
    ])
    const abertos = await db
      .select({ id: parceiroIndicacoes.id })
      .from(parceiroIndicacoes)
      .where(
        and(
          eq(parceiroIndicacoes.visitanteHash, hashDoVisitante(token)),
          isNull(parceiroIndicacoes.substituidaEm),
        ),
      )
    expect(abertos).toHaveLength(1)
  })
})

describe('João → Maria: último parceiro sem apagar o anterior', () => {
  it('preserva o ciclo de João e marca a substituição', async () => {
    const primeira = await acessarLink(joao.codigo)
    const navegador = primeira.cookie!
    const segunda = await acessarLink(maria.codigo, navegador)

    // O navegador continua sendo o mesmo — é isso que liga as duas chegadas.
    expect(segunda.cookie).toBe(navegador)

    const deJoao = await listarIndicacoesDoParceiro(joao.id)
    const deMaria = await listarIndicacoesDoParceiro(maria.id)

    expect(deJoao).toHaveLength(1)
    expect(deMaria).toHaveLength(1)

    // João continua no histórico, com o evento dele, marcado como substituído.
    expect(deJoao[0].substituidaEm).not.toBeNull()
    expect(deJoao[0].eventos).toHaveLength(1)

    // Maria é a indicação atual.
    expect(deMaria[0].substituidaEm).toBeNull()

    const [antigo] = await db
      .select({ substituidaPorId: parceiroIndicacoes.substituidaPorId })
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.id, deJoao[0].id))
    expect(antigo.substituidaPorId).toBe(deMaria[0].id)
  })

  it('voltar para o link de João abre um ciclo novo, sem apagar o de Maria', async () => {
    const primeira = await acessarLink(joao.codigo)
    await acessarLink(maria.codigo, primeira.cookie!)
    await acessarLink(joao.codigo, primeira.cookie!)

    const deJoao = await listarIndicacoesDoParceiro(joao.id)
    const deMaria = await listarIndicacoesDoParceiro(maria.id)

    expect(deJoao).toHaveLength(2)
    expect(deMaria).toHaveLength(1)
    expect(deMaria[0].substituidaEm).not.toBeNull()
    // O mais recente de João está aberto; o primeiro segue fechado.
    expect(deJoao[0].substituidaEm).toBeNull()
    expect(deJoao[1].substituidaEm).not.toBeNull()
  })

  it('navegadores diferentes não se misturam', async () => {
    await acessarLink(joao.codigo)
    await acessarLink(joao.codigo)
    const indicacoes = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacoes).toHaveLength(2)
    expect(indicacoes.every((i) => i.substituidaEm === null)).toBe(true)
  })
})

describe('o que a tela do parceiro recebe', () => {
  it('não devolve hash, user agent nem host de origem', async () => {
    await acessarLink(joao.codigo, undefined, {
      'user-agent': 'Mozilla/5.0 (teste)',
      referer: 'https://www.instagram.com/',
    })
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(Object.keys(indicacao).sort()).toEqual(
      ['criadoEm', 'eventos', 'id', 'lead', 'negocios', 'origem', 'substituidaEm'].sort(),
    )
  })

  it('sem cadastro, o visitante segue anônimo', async () => {
    await acessarLink(joao.codigo)
    const [indicacao] = await listarIndicacoesDoParceiro(joao.id)
    expect(indicacao.lead).toBeNull()
  })

  it('parceiro sem acesso nenhum recebe lista vazia', async () => {
    expect(await listarIndicacoesDoParceiro(maria.id)).toEqual([])
  })
})

describe('nada do que já existia mudou', () => {
  it('registrar acesso não cria, altera nem apaga usuários ou perfis', async () => {
    const contarUsuarios = async () =>
      (await db.select({ id: usuarios.id }).from(usuarios)).length
    const contarVinculos = async () =>
      (await db.select({ usuarioId: usuariosPerfis.usuarioId }).from(usuariosPerfis)).length

    const usuariosAntes = await contarUsuarios()
    const vinculosAntes = await contarVinculos()

    const primeira = await acessarLink(joao.codigo)
    await acessarLink(maria.codigo, primeira.cookie!)

    expect(await contarUsuarios()).toBe(usuariosAntes)
    expect(await contarVinculos()).toBe(vinculosAntes)
  })

  it('acesso pelo link não mexe no acesso de ninguém', async () => {
    for (const chave of ['joao', 'profissional', 'gestor'] as const) {
      const antes = await resolverAcessoUsuario(contas[chave].id)
      await acessarLink(joao.codigo)
      expect(await resolverAcessoUsuario(contas[chave].id)).toEqual(antes)
    }
  })

  it('o link do parceiro continua o mesmo depois de receber acessos', async () => {
    const antes = await obterParceiroDoUsuario(contas.joao.id)
    await acessarLink(joao.codigo)
    const depois = await obterParceiroDoUsuario(contas.joao.id)
    expect(depois!.codigo).toBe(antes!.codigo)
    expect(depois!.link.url).toBe(antes!.link.url)
  })

  it('o link com destino registra o lead e leva ao perfil escolhido', async () => {
    const { GET } = await import('@/app/p/[codigo]/route')
    const { NextRequest } = await import('next/server')
    const perfil = '/perfil-profissional?prestador=706b616e-6d38-4aa0-a40d-8c8cdedafb1a'

    const resposta = await GET(
      new NextRequest(
        `https://vincis.test/p/${maria.codigo}?d=${encodeURIComponent(perfil)}`,
      ),
      { params: Promise.resolve({ codigo: maria.codigo }) },
    )

    // Mesmo perfil que o parceiro compartilhou, e o acesso ficou registrado.
    expect(resposta.status).toBe(307)
    expect(resposta.headers.get('location')).toContain('/perfil-profissional')
    expect(resposta.headers.get('location')).toContain(
      'prestador=706b616e-6d38-4aa0-a40d-8c8cdedafb1a',
    )
    expect(resposta.headers.get('set-cookie')).toContain(COOKIE_INDICACAO)

    const ciclos = await listarIndicacoesDoParceiro(maria.id)
    expect(ciclos).toHaveLength(1)
    expect(ciclos[0].eventos.map((e) => e.tipo)).toEqual(['acessou_link'])
  })

  it('destino externo no link não redireciona para fora da Vincis', async () => {
    const { GET } = await import('@/app/p/[codigo]/route')
    const { NextRequest } = await import('next/server')

    const resposta = await GET(
      new NextRequest(
        `https://vincis.test/p/${maria.codigo}?d=${encodeURIComponent('//evil.com')}`,
      ),
      { params: Promise.resolve({ codigo: maria.codigo }) },
    )

    const destino = resposta.headers.get('location') ?? ''
    expect(destino).not.toContain('evil.com')
    expect(new URL(destino).pathname).toBe('/')
  })

  it('o pedido de saque existe, mas o pagamento não', async () => {
    /*
      O parceiro já consegue solicitar o saque, e o valor fica reservado. O que
      continua não existindo é dinheiro saindo: nenhuma integração bancária,
      nenhum Pix, nenhuma comissão marcada como paga por conta própria.
    */
    const integracoes = await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and (table_name like '%pix%' or table_name like '%conta_banc%')
    `)
    expect([...integracoes]).toHaveLength(0)

    const pagas = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.status, 'paga'))
    expect(pagas).toHaveLength(0)
  })

  it('excluir a conta do parceiro leva o histórico junto e não falha', async () => {
    await acessarLink(maria.codigo)
    expect(await listarIndicacoesDoParceiro(maria.id)).toHaveLength(1)

    const { excluirUsuarioSeguro } = await import(
      '@/features/usuarios/lib/excluir-usuario-seguro'
    )
    const resultado = await excluirUsuarioSeguro(contas.maria.id)
    expect(resultado.sucesso).toBe(true)

    const sobrou = await db
      .select({ id: parceiros.id })
      .from(parceiros)
      .where(eq(parceiros.usuarioId, contas.maria.id))
    expect(sobrou).toHaveLength(0)
    expect(await listarIndicacoesDoParceiro(maria.id)).toHaveLength(0)
  })
})
