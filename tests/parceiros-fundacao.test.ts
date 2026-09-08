import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { parceiros, usuarios } from '@/db/schema'
import {
  codigoBemFormado,
  gerarCodigoDoParceiro,
  normalizarCodigo,
} from '@/features/parceiros/lib/codigo-do-parceiro'
import { montarLinkDoParceiro } from '@/features/parceiros/lib/link-de-indicacao'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

const { ativarParceiro } = await import(
  '@/features/parceiros/actions/ativar-parceiro'
)
const { obterParceiroDaSessao, obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)
const { excluirUsuarioSeguro } = await import(
  '@/features/usuarios/lib/excluir-usuario-seguro'
)

const SUFIXO = '@parceiros.fundacao.teste'

type Chave = 'cliente' | 'profissional' | 'gestor' | 'descartavel'

let contas: Record<Chave, { id: string; token: string }>

beforeAll(async () => {
  await limparContas(SUFIXO)
  contas = (await criarContas(SUFIXO, {
    cliente: { perfil: 'cliente' },
    profissional: { perfil: 'profissional', prestador: 'profissional' },
    gestor: { perfil: 'gestor_vincis' },
    descartavel: { perfil: 'cliente' },
  }, '119495')) as Record<Chave, { id: string; token: string }>
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

async function contarParceiros(usuarioId: string) {
  const linhas = await db
    .select({ id: parceiros.id })
    .from(parceiros)
    .where(eq(parceiros.usuarioId, usuarioId))
  return linhas.length
}

describe('código público do parceiro', () => {
  it('gera código bem formado, sem caracteres confundíveis', () => {
    for (let i = 0; i < 200; i += 1) {
      const codigo = gerarCodigoDoParceiro()
      expect(codigo).toHaveLength(8)
      expect(codigoBemFormado(codigo)).toBe(true)
      expect(codigo).not.toMatch(/[01ilou]/)
    }
  })

  it('não repete em volume — o sorteio tem entropia real', () => {
    const sorteados = new Set<string>()
    for (let i = 0; i < 2000; i += 1) sorteados.add(gerarCodigoDoParceiro())
    expect(sorteados.size).toBe(2000)
  })

  it('recusa formatos que não são código', () => {
    expect(codigoBemFormado('')).toBe(false)
    expect(codigoBemFormado('abc')).toBe(false)
    expect(codigoBemFormado('abcdefgh1')).toBe(false)
    expect(codigoBemFormado('abcdefg0')).toBe(false)
    expect(normalizarCodigo('  ABCDEFGH  ')).toBe('abcdefgh')
  })
})

describe('link geral de indicação', () => {
  it('usa o prefixo próprio e exibe sem protocolo', () => {
    const link = montarLinkDoParceiro('ab3k9xq2', 'https://vincis.com.br')
    expect(link.url).toBe('https://vincis.com.br/p/ab3k9xq2')
    expect(link.base).toBe('vincis.com.br/p/')
    expect(link.codigo).toBe('ab3k9xq2')
  })

  it('não duplica barra quando a base termina com uma', () => {
    expect(montarLinkDoParceiro('ab3k9xq2', 'https://vincis.com.br/').url).toBe(
      'https://vincis.com.br/p/ab3k9xq2',
    )
  })

  it('degrada para caminho relativo sem APP_URL, em vez de quebrar', () => {
    expect(montarLinkDoParceiro('ab3k9xq2', '').url).toBe('/p/ab3k9xq2')
  })

  it('não carrega nada da conta — só o código', () => {
    const link = montarLinkDoParceiro('ab3k9xq2', 'https://vincis.com.br')
    expect(link.url).not.toMatch(/@|cliente|[0-9a-f]{8}-/)
  })
})

describe('ativação do Programa de Parceiros', () => {
  it('exige sessão: sem ela nada é gravado', async () => {
    sairDaSessao()
    const resultado = await ativarParceiro()
    expect(resultado.sucesso).toBe(false)

    const total = await db.select({ id: parceiros.id }).from(parceiros)
    expect(total.every((linha) => linha.id)).toBe(true)
  })

  it('usuário que ainda não é parceiro consegue ativar', async () => {
    entrarComo(contas.cliente.token)
    expect(await obterParceiroDaSessao()).toBeNull()

    const resultado = await ativarParceiro()
    expect(resultado.sucesso).toBe(true)

    const parceiro = await obterParceiroDoUsuario(contas.cliente.id)
    expect(parceiro).not.toBeNull()
    expect(codigoBemFormado(parceiro!.codigo)).toBe(true)
  })

  it('ativação repetida não duplica registro nem troca o código', async () => {
    entrarComo(contas.cliente.token)
    const antes = await obterParceiroDoUsuario(contas.cliente.id)

    await ativarParceiro()
    await ativarParceiro()

    const depois = await obterParceiroDoUsuario(contas.cliente.id)
    expect(depois!.id).toBe(antes!.id)
    expect(depois!.codigo).toBe(antes!.codigo)
    expect(await contarParceiros(contas.cliente.id)).toBe(1)
  })

  it('o código permanece o mesmo em novo acesso', async () => {
    entrarComo(contas.cliente.token)
    const primeira = await obterParceiroDaSessao()
    const segunda = await obterParceiroDoUsuario(contas.cliente.id)
    expect(segunda!.codigo).toBe(primeira!.codigo)
    expect(segunda!.link.url.endsWith(`/p/${primeira!.codigo}`)).toBe(true)
  })

  it('dois cliques simultâneos criam um parceiro só', async () => {
    const [a, b] = await Promise.all([
      comSessao(contas.gestor.token, () => ativarParceiro()),
      comSessao(contas.gestor.token, () => ativarParceiro()),
    ])
    expect(a.sucesso).toBe(true)
    expect(b.sucesso).toBe(true)
    expect(await contarParceiros(contas.gestor.id)).toBe(1)
  })

  it('profissional também pode ser parceiro, e com código diferente', async () => {
    entrarComo(contas.profissional.token)
    expect((await ativarParceiro()).sucesso).toBe(true)

    const doCliente = await obterParceiroDoUsuario(contas.cliente.id)
    const doProfissional = await obterParceiroDoUsuario(contas.profissional.id)
    expect(doProfissional).not.toBeNull()
    expect(doProfissional!.codigo).not.toBe(doCliente!.codigo)
  })

  it('ninguém ativa pela conta alheia: a ação não recebe usuário', async () => {
    entrarComo(contas.cliente.token)
    // A assinatura é a garantia: não há parâmetro por onde passar outra conta.
    expect(ativarParceiro.length).toBe(0)
    expect(await contarParceiros(contas.descartavel.id)).toBe(0)
  })
})

describe('nada do que já existia mudou', () => {
  it('ativar não altera perfil, destino nem áreas permitidas', async () => {
    for (const chave of ['cliente', 'profissional', 'gestor'] as const) {
      const antes = await resolverAcessoUsuario(contas[chave].id)
      entrarComo(contas[chave].token)
      await ativarParceiro()
      const depois = await resolverAcessoUsuario(contas[chave].id)
      expect(depois).toEqual(antes)
    }
  })

  it('a sessão continua devolvendo exatamente os mesmos dados', async () => {
    const { obterSessaoServidor } = await import(
      '@/features/usuarios/lib/sessao-servidor'
    )
    entrarComo(contas.cliente.token)
    const sessao = await obterSessaoServidor()
    expect(sessao?.id).toBe(contas.cliente.id)
    expect(sessao?.perfilTipo).toBe('cliente')
    expect(sessao).not.toHaveProperty('ehParceiro')
  })

  it('excluir a conta de um parceiro continua funcionando', async () => {
    entrarComo(contas.descartavel.token)
    expect((await ativarParceiro()).sucesso).toBe(true)
    expect(await contarParceiros(contas.descartavel.id)).toBe(1)

    const resultado = await excluirUsuarioSeguro(contas.descartavel.id)
    expect(resultado.sucesso).toBe(true)

    // A cascata levou o parceiro junto: nenhum registro órfão fica para trás.
    expect(await contarParceiros(contas.descartavel.id)).toBe(0)
    const restante = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(inArray(usuarios.id, [contas.descartavel.id]))
    expect(restante).toHaveLength(0)
  })
})
