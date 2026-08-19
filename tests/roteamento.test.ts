import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

let cenario: Cenario

beforeAll(async () => {
  cenario = await montarCenario()
})

afterAll(async () => {
  sairDaSessao()
  await limparCenario()
})

/**
 * O `src/proxy.ts` compara a rota pedida com o destino resolvido. Reproduzir a
 * comparação aqui testa a mesma decisão que o middleware toma em cada URL
 * digitada à mão, sem precisar de um servidor HTTP.
 */
const ROTAS_PROTEGIDAS = [
  '/gestao',
  '/cadastro-profissional',
  '/cadastro-colaborador',
  '/admin',
] as const

async function rotaLiberada(usuarioId: string, rota: string) {
  const acesso = await resolverAcessoUsuario(usuarioId)
  if (!acesso) return false
  const rotaAtual = ROTAS_PROTEGIDAS.find((protegida) =>
    rota.startsWith(protegida),
  )
  return rotaAtual === acesso.destino
}

describe('resolução central de destino', () => {
  it('Gestor Vincis vai para /gestao', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.gestor)
    expect(acesso?.destino).toBe('/gestao')
    expect(acesso?.tipoPrestador).toBeNull()
  })

  it('Profissional aprovado vai para /admin', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.profissionalSozinho)
    expect(acesso?.destino).toBe('/admin')
    expect(acesso?.tipoPrestador).toBe('profissional')
    expect(acesso?.habilitado).toBe(true)
  })

  it('Colaborador ativo vai para /admin sem CRC/OAB', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.colaboradorSozinho)
    expect(acesso?.destino).toBe('/admin')
    expect(acesso?.tipoPrestador).toBe('colaborador')
    expect(acesso?.statusProfissional).toBe('ativo')

    const [cadastro] = await db
      .select({ numeroRegistro: perfisProfissionais.numeroRegistro })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, cenario.ids.colaboradorSozinho))
    expect(cadastro.numeroRegistro).toBeNull()
  })

  it('Profissional ainda não aprovado vai para /cadastro-profissional', async () => {
    await db
      .update(perfisProfissionais)
      .set({ statusAnalise: 'aguardando_analise' })
      .where(eq(perfisProfissionais.usuarioId, cenario.ids.estranho))

    const acesso = await resolverAcessoUsuario(cenario.ids.estranho)
    expect(acesso?.destino).toBe('/cadastro-profissional')
    expect(acesso?.habilitado).toBe(false)

    await db
      .update(perfisProfissionais)
      .set({ statusAnalise: 'aprovado' })
      .where(eq(perfisProfissionais.usuarioId, cenario.ids.estranho))
  })

  it('Colaborador ainda sem cadastro vai para /cadastro-colaborador', async () => {
    await db
      .update(perfisProfissionais)
      .set({ statusAnalise: 'rascunho' })
      .where(eq(perfisProfissionais.usuarioId, cenario.ids.colaboradorExterno))

    const acesso = await resolverAcessoUsuario(cenario.ids.colaboradorExterno)
    expect(acesso?.destino).toBe('/cadastro-colaborador')

    await db
      .update(perfisProfissionais)
      .set({ statusAnalise: 'ativo' })
      .where(eq(perfisProfissionais.usuarioId, cenario.ids.colaboradorExterno))
  })
})

describe('URL digitada à mão', () => {
  it('o Gestor só entra em /gestao', async () => {
    expect(await rotaLiberada(cenario.ids.gestor, '/gestao')).toBe(true)
    expect(await rotaLiberada(cenario.ids.gestor, '/gestao/usuarios')).toBe(true)
    expect(await rotaLiberada(cenario.ids.gestor, '/admin')).toBe(false)
    expect(
      await rotaLiberada(cenario.ids.gestor, '/cadastro-profissional'),
    ).toBe(false)
    expect(await rotaLiberada(cenario.ids.gestor, '/cadastro-colaborador')).toBe(
      false,
    )
  })

  it('nenhum prestador alcança /gestao', async () => {
    for (const persona of [
      'proprietario',
      'adminProfissional',
      'adminColaborador',
      'profissionalMembro',
      'colaboradorMembro',
      'profissionalSozinho',
      'colaboradorSozinho',
      'colaboradorExterno',
    ] as const) {
      expect(
        await rotaLiberada(cenario.ids[persona], '/gestao'),
        `${persona} não deveria alcançar /gestao`,
      ).toBe(false)
      expect(await rotaLiberada(cenario.ids[persona], '/admin')).toBe(true)
    }
  })
})

describe('porta de entrada dos prestadores', () => {
  it('abre para Profissional e para Colaborador habilitados', async () => {
    for (const persona of ['profissionalSozinho', 'colaboradorSozinho'] as const) {
      entrarComo(cenario.tokens[persona])
      const prestador = await obterPrestadorSessao()
      expect(prestador?.usuarioId).toBe(cenario.ids[persona])
    }
  })

  it('não abre para o Gestor Vincis', async () => {
    entrarComo(cenario.tokens.gestor)
    expect(await obterPrestadorSessao()).toBeNull()
  })

  it('a guarda de gestão só reconhece o Gestor', async () => {
    entrarComo(cenario.tokens.gestor)
    expect(await validarGestorVincis()).not.toBeNull()

    entrarComo(cenario.tokens.proprietario)
    expect(await validarGestorVincis()).toBeNull()

    sairDaSessao()
    expect(await validarGestorVincis()).toBeNull()
  })
})
