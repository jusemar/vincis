import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { eventosAuditoria, sessoesUsuario, tokensUsuario, usuarios } from '@/db/schema'
import { solicitarCodigoRecuperacaoSms } from '@/features/usuarios/actions/recuperacao-senha-sms'
import {
  confirmarCodigoVerificacaoCelular,
  obterCelularDaConta,
  solicitarCodigoVerificacaoCelular,
} from '@/features/usuarios/actions/verificacao-celular'
import { MAXIMO_TENTATIVAS_CODIGO, MENSAGEM_CODIGO_BLOQUEADO, MENSAGEM_CODIGO_INVALIDO, MENSAGEM_RECUPERACAO_SMS } from '@/features/usuarios/constants/recuperacao-senha'
import { gerarHash } from '@/features/usuarios/lib/hash-senha'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { montarMensagemCodigoVerificacao } from '@/integracoes/sms/mensagens-cadastro-sms'
import { entrarComo, sairDaSessao } from './setup/sessao'

/** Verificação do celular pelo próprio usuário (área logada). SMS sempre simulado. */

const envios = vi.hoisted(() => ({
  verificacao: [] as { celularNacional: string; codigo: string }[],
  recuperacao: [] as { celularNacional: string; codigo: string }[],
}))
vi.mock('@/integracoes/sms/mensagens-cadastro-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/mensagens-cadastro-sms')>()),
  enviarSmsCodigoVerificacao: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.verificacao.push(d)
    return { sucesso: true }
  }),
}))
vi.mock('@/integracoes/sms/enviar-codigo-redefinicao-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/enviar-codigo-redefinicao-sms')>()),
  enviarSmsCodigoRedefinicao: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.recuperacao.push(d)
    return { sucesso: true }
  }),
}))

const SUFIXO = '@verificacao-celular.teste'
const contas = {} as Record<'dono' | 'outro' | 'duplicadoA' | 'duplicadoB', { id: string; token: string }>

async function criar(chave: keyof typeof contas, whatsapp: string) {
  const [linha] = await db
    .insert(usuarios)
    .values({ nome: `Conta ${chave}`, email: `${chave.toLowerCase()}${SUFIXO}`, whatsapp, senhaHash: await gerarHash('senha12345'), status: 'ativo', emailVerificado: true })
    .returning({ id: usuarios.id })
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({ usuarioId: linha.id, tokenHash: hash, expiraEm: new Date(Date.now() + 3_600_000) })
  contas[chave] = { id: linha.id, token }
}

async function limpar() {
  const ids = (await db.select({ id: usuarios.id }).from(usuarios).where(like(usuarios.email, `%${SUFIXO}`))).map(({ id }) => id)
  if (ids.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
    await db.delete(usuarios).where(inArray(usuarios.id, ids))
  }
  await db.delete(eventosAuditoria).where(sql`${eventosAuditoria.acao} like 'verificacao_celular_%' or ${eventosAuditoria.acao} = 'celular_verificado_por_sms' or ${eventosAuditoria.acao} like 'recuperacao_senha_%'`)
}

async function liberar() {
  await db.update(tokensUsuario).set({ createdAt: sql`now() - interval '2 minutes'` })
  await db.delete(eventosAuditoria).where(sql`${eventosAuditoria.acao} like 'verificacao_celular_%' or ${eventosAuditoria.acao} like 'recuperacao_senha_%'`)
}

async function pedir() {
  const r = await solicitarCodigoVerificacaoCelular()
  if (!r.sucesso) throw new Error(r.mensagem)
  return { solicitacaoId: r.solicitacaoId, codigo: envios.verificacao.at(-1)!.codigo }
}

const errado = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, '0')
const verificadoNoBanco = async (id: string) => (await db.select({ v: usuarios.whatsappVerificado }).from(usuarios).where(eq(usuarios.id, id)))[0].v

beforeAll(async () => {
  await limpar()
  await criar('dono', '(31) 98765-2001') // gravado com máscara, como contas antigas
  await criar('outro', '31987652002')
  await criar('duplicadoA', '31987652003')
  await criar('duplicadoB', '+55 31 98765-2003')
})

beforeEach(async () => {
  envios.verificacao.length = 0
  envios.recuperacao.length = 0
  sairDaSessao()
  await liberar()
})

afterAll(limpar)

describe('verificar o próprio celular', () => {
  it('exige sessão', async () => {
    expect(await solicitarCodigoVerificacaoCelular()).toMatchObject({ sucesso: false })
    expect(await obterCelularDaConta()).toBeNull()
    expect(envios.verificacao).toHaveLength(0)
  })

  it('mostra o celular como não verificado e envia o código ao número DA CONTA', async () => {
    entrarComo(contas.dono.token)
    expect(await obterCelularDaConta()).toEqual({ celular: '(31) 98765-2001', celularMascarado: '(31) •••••-2001', verificado: false })
    const r = await solicitarCodigoVerificacaoCelular()
    expect(r).toMatchObject({ sucesso: true, mensagem: MENSAGEM_RECUPERACAO_SMS, aguardarSegundos: 60, validadeSegundos: 600 })
    expect(envios.verificacao).toEqual([{ celularNacional: '31987652001', codigo: expect.stringMatching(/^\d{6}$/) }])
    const mensagem = montarMensagemCodigoVerificacao('123456')
    expect(mensagem.length).toBeLessThanOrEqual(160)
    expect(mensagem).toMatch(/^[\x20-\x7E]+$/)
    if (r.sucesso) {
      const [token] = await db.select().from(tokensUsuario).where(eq(tokensUsuario.id, r.solicitacaoId))
      expect(token.tokenHash).not.toContain(envios.verificacao[0].codigo)
    }
  })

  it('reenvio só depois de 60 s; o novo código invalida o anterior', async () => {
    entrarComo(contas.dono.token)
    const primeiro = await pedir()
    expect(await solicitarCodigoVerificacaoCelular()).toMatchObject({ sucesso: false })
    expect(envios.verificacao).toHaveLength(1)
    await liberar()
    const segundo = await pedir()
    expect((await confirmarCodigoVerificacaoCelular(primeiro)).sucesso).toBe(false)
    expect(segundo.solicitacaoId).not.toBe(primeiro.solicitacaoId)
    expect(envios.verificacao).toHaveLength(2)
    expect(await verificadoNoBanco(contas.dono.id)).toBe(false)
  })

  it('código expirado é recusado; 5 erros bloqueiam', async () => {
    entrarComo(contas.dono.token)
    const pedido = await pedir()
    await db.update(tokensUsuario).set({ expiraEm: sql`now() - interval '1 second'` }).where(eq(tokensUsuario.id, pedido.solicitacaoId))
    expect(await confirmarCodigoVerificacaoCelular(pedido)).toMatchObject({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO })
    await liberar()
    const outro = await pedir()
    let ultima
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO; i++) ultima = await confirmarCodigoVerificacaoCelular({ ...outro, codigo: errado(outro.codigo) })
    expect(ultima).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true })
    expect((await confirmarCodigoVerificacaoCelular(outro)).sucesso).toBe(false)
    expect(await verificadoNoBanco(contas.dono.id)).toBe(false)
  })

  it('outra conta não confirma o pedido de quem não é ela', async () => {
    entrarComo(contas.dono.token)
    const pedido = await pedir()
    entrarComo(contas.outro.token)
    expect(await confirmarCodigoVerificacaoCelular(pedido)).toMatchObject({ sucesso: false })
    expect(await verificadoNoBanco(contas.dono.id)).toBe(false)
    expect(await verificadoNoBanco(contas.outro.id)).toBe(false)
  })

  it('trocar o número depois do pedido invalida o código', async () => {
    entrarComo(contas.outro.token)
    const pedido = await pedir()
    await db.update(usuarios).set({ whatsapp: '31987652009' }).where(eq(usuarios.id, contas.outro.id))
    expect((await confirmarCodigoVerificacaoCelular(pedido)).sucesso).toBe(false)
    expect(await verificadoNoBanco(contas.outro.id)).toBe(false)
  })

  it('número em duas contas não é verificado', async () => {
    entrarComo(contas.duplicadoA.token)
    expect(await solicitarCodigoVerificacaoCelular()).toMatchObject({ sucesso: false })
    expect(envios.verificacao).toHaveLength(0)
  })

  it('código certo verifica o celular (sem tocar no e-mail) e libera a recuperação por SMS', async () => {
    // Antes: recuperação por SMS não envia para número não verificado.
    expect((await solicitarCodigoRecuperacaoSms({ celular: '31987652001' })).sucesso).toBe(true)
    expect(envios.recuperacao).toHaveLength(0)

    entrarComo(contas.dono.token)
    const pedido = await pedir()
    expect(await confirmarCodigoVerificacaoCelular({ ...pedido, codigo: errado(pedido.codigo) })).toMatchObject({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO })
    expect(await confirmarCodigoVerificacaoCelular(pedido)).toMatchObject({ sucesso: true })
    const [conta] = await db.select().from(usuarios).where(eq(usuarios.id, contas.dono.id))
    expect(conta).toMatchObject({ whatsapp: '31987652001', whatsappVerificado: true, whatsappVerificadoPorId: null, emailVerificado: true })
    expect(await obterCelularDaConta()).toMatchObject({ verificado: true })
    // Código de uso único; e não há novo pedido para quem já está verificado.
    expect((await confirmarCodigoVerificacaoCelular(pedido)).sucesso).toBe(false)
    expect(await solicitarCodigoVerificacaoCelular()).toMatchObject({ sucesso: false, mensagem: 'Seu celular já está verificado.' })
    const eventos = await db.select().from(eventosAuditoria).where(and(eq(eventosAuditoria.acao, 'celular_verificado_por_sms'), eq(eventosAuditoria.usuarioId, contas.dono.id)))
    expect(eventos).toHaveLength(1)

    // Depois: a recuperação por SMS envia o código.
    sairDaSessao()
    await liberar()
    expect((await solicitarCodigoRecuperacaoSms({ celular: '(31) 98765-2001' })).sucesso).toBe(true)
    expect(envios.recuperacao.map((e) => e.celularNacional)).toEqual(['31987652001'])
  })
})
