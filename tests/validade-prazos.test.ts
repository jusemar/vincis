import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cadastrosCelular, eventosAuditoria, perfis, sessoesUsuario, tokensUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { concluirCadastroPorCelular, solicitarCodigoCadastroSms, verificarCodigoCadastroSms } from '@/features/usuarios/actions/cadastro-celular'
import { solicitarCodigoRecuperacaoSms, verificarCodigoRecuperacaoSms } from '@/features/usuarios/actions/recuperacao-senha-sms'
import { redefinirSenha } from '@/features/usuarios/actions/redefinir-senha'
import { solicitarRedefinicaoSenha } from '@/features/usuarios/actions/solicitar-redefinicao-senha'
import { confirmarCodigoVerificacaoCelular, solicitarCodigoVerificacaoCelular } from '@/features/usuarios/actions/verificacao-celular'
import {
  INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS,
  MAXIMO_TENTATIVAS_CODIGO,
  MENSAGEM_RECUPERACAO_EMAIL,
  VALIDADE_CODIGO_SMS_SEGUNDOS,
  VALIDADE_LINK_EMAIL_MINUTOS,
} from '@/features/usuarios/constants/recuperacao-senha'
import { gerarHash } from '@/features/usuarios/lib/hash-senha'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { montarMensagemCodigoCadastro, montarMensagemCodigoVerificacao } from '@/integracoes/sms/mensagens-cadastro-sms'
import { montarMensagemCodigoSms } from '@/integracoes/sms/enviar-codigo-redefinicao-sms'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Prazos: link do e-mail e códigos SMS valem 10 minutos (conferido no
 * servidor); o intervalo para pedir outro continua 60 s. Relógio SIMULADO só
 * para a aplicação (`Date`): banco e timers seguem reais. Provedores simulados.
 */

const envios = vi.hoisted(() => ({
  email: [] as { destinatario: string; token: string }[],
  recuperacao: [] as { celularNacional: string; codigo: string }[],
  cadastro: [] as { celularNacional: string; codigo: string }[],
  verificacao: [] as { celularNacional: string; codigo: string }[],
}))
vi.mock('@/integracoes/email/enviar-redefinicao-senha-email', () => ({
  enviarEmailRedefinicaoSenha: vi.fn(async (d: { destinatario: string; token: string }) => {
    envios.email.push(d)
    return { sucesso: true, id: 'email-teste' }
  }),
}))
vi.mock('@/integracoes/sms/enviar-codigo-redefinicao-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/enviar-codigo-redefinicao-sms')>()),
  enviarSmsCodigoRedefinicao: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.recuperacao.push(d)
    return { sucesso: true }
  }),
}))
vi.mock('@/integracoes/sms/mensagens-cadastro-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/mensagens-cadastro-sms')>()),
  enviarSmsCodigoCadastro: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.cadastro.push(d)
    return { sucesso: true }
  }),
  enviarSmsCodigoVerificacao: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.verificacao.push(d)
    return { sucesso: true }
  }),
  enviarSmsCelularJaCadastrado: vi.fn(async () => ({ sucesso: true })),
}))

const SUFIXO = '@validade-prazos.teste'
const CELULAR_RECUPERACAO = '31987655001'
const CELULAR_VERIFICACAO = '31987655002'
const CELULAR_CADASTRO = '31987655003'
const MIN = 60_000
let contaRecuperacao = ''
let sessaoVerificacao = ''
/** Relógio da aplicação: sempre para a frente, a partir do horário real. */
let agora = Date.now()
const avancar = (ms: number) => {
  agora += ms
  vi.setSystemTime(agora)
}

async function limpar() {
  const ids = (
    await db.select({ id: usuarios.id }).from(usuarios).where(or(like(usuarios.email, `%${SUFIXO}`), like(usuarios.nome, 'Prazo Cadastro%')))
  ).map(({ id }) => id)
  if (ids.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
    await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
    await db.delete(usuarios).where(inArray(usuarios.id, ids))
  }
  await db.delete(cadastrosCelular).where(eq(cadastrosCelular.celular, CELULAR_CADASTRO))
  await db.delete(eventosAuditoria).where(
    sql`${eventosAuditoria.acao} like 'recuperacao_senha_%' or ${eventosAuditoria.acao} like 'cadastro_celular_%' or ${eventosAuditoria.acao} like 'verificacao_celular_%' or ${eventosAuditoria.acao} in ('celular_verificado_por_sms', 'conta_criada_por_celular')`,
  )
}

beforeAll(async () => {
  await limpar()
  for (const nome of ['cliente']) await db.insert(perfis).values({ nome }).onConflictDoNothing()
  const senhaHash = await gerarHash('senhaPrazo123')
  const [r] = await db
    .insert(usuarios)
    .values({ nome: 'Prazo Recuperacao', email: `recuperacao${SUFIXO}`, whatsapp: CELULAR_RECUPERACAO, whatsappVerificado: true, senhaHash, status: 'ativo', emailVerificado: true })
    .returning({ id: usuarios.id })
  contaRecuperacao = r.id
  const [v] = await db
    .insert(usuarios)
    .values({ nome: 'Prazo Verificacao', email: `verificacao${SUFIXO}`, whatsapp: CELULAR_VERIFICACAO, senhaHash, status: 'ativo', emailVerificado: true })
    .returning({ id: usuarios.id })
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({ usuarioId: v.id, tokenHash: hash, expiraEm: new Date(Date.now() + 24 * 3_600_000) })
  sessaoVerificacao = token
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // Cada teste começa 2 min depois do anterior: o intervalo de 60 s não interfere.
  avancar(2 * MIN)
  for (const lista of Object.values(envios)) lista.length = 0
  sairDaSessao()
})

afterEach(() => vi.useRealTimers())
afterAll(limpar)

describe('configuração dos prazos', () => {
  it('link e códigos valem 10 min; reenvio continua 60 s (prazos diferentes)', () => {
    expect(VALIDADE_LINK_EMAIL_MINUTOS).toBe(10)
    expect(VALIDADE_CODIGO_SMS_SEGUNDOS).toBe(600)
    expect(INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS).toBe(60)
    expect(MENSAGEM_RECUPERACAO_EMAIL).toContain('vale por 10 minutos')
    for (const m of [montarMensagemCodigoSms('123456'), montarMensagemCodigoCadastro('123456'), montarMensagemCodigoVerificacao('123456')]) {
      expect(m).toContain('Valido por 10 minutos')
      expect(m.length).toBeLessThanOrEqual(160)
    }
  })
})

describe('link de recuperação por e-mail', () => {
  it('vale aos 9:59, redefine a senha e não pode ser reutilizado', async () => {
    expect(await solicitarRedefinicaoSenha({ emailOuWhatsapp: `recuperacao${SUFIXO}` })).toMatchObject({ sucesso: true, validadeMinutos: 10 })
    const { token } = envios.email[0]
    const [linha] = await db.select().from(tokensUsuario).where(eq(tokensUsuario.usuarioId, contaRecuperacao)).orderBy(sql`created_at desc`).limit(1)
    expect(linha.expiraEm.getTime() - agora).toBe(10 * MIN) // calculado no servidor
    avancar(9 * MIN + 59_000)
    expect(await redefinirSenha({ token, novaSenha: 'senhaNova123' })).toMatchObject({ sucesso: true })
    expect(await redefinirSenha({ token, novaSenha: 'outraSenha1' })).toMatchObject({ sucesso: false })
  })

  it('expira aos 10:01', async () => {
    await solicitarRedefinicaoSenha({ emailOuWhatsapp: `recuperacao${SUFIXO}` })
    avancar(10 * MIN + 1_000)
    expect(await redefinirSenha({ token: envios.email[0].token, novaSenha: 'senhaNova123' })).toMatchObject({ sucesso: false })
  })

  it('novo link após 60 s (sem esperar o anterior expirar) e o anterior deixa de valer', async () => {
    await solicitarRedefinicaoSenha({ emailOuWhatsapp: `recuperacao${SUFIXO}` })
    avancar(30_000)
    await solicitarRedefinicaoSenha({ emailOuWhatsapp: `recuperacao${SUFIXO}` })
    expect(envios.email).toHaveLength(1) // dentro de 60 s: não reenvia
    avancar(31_000)
    await solicitarRedefinicaoSenha({ emailOuWhatsapp: `recuperacao${SUFIXO}` })
    expect(envios.email).toHaveLength(2) // aos 61 s: novo link, com o anterior ainda dentro dos 10 min
    expect(await redefinirSenha({ token: envios.email[0].token, novaSenha: 'senhaNova123' })).toMatchObject({ sucesso: false })
    expect(await redefinirSenha({ token: envios.email[1].token, novaSenha: 'senhaNova123' })).toMatchObject({ sucesso: true })
  })
})

describe('código SMS — recuperação de senha', () => {
  async function pedir() {
    const r = await solicitarCodigoRecuperacaoSms({ celular: CELULAR_RECUPERACAO })
    if (!r.sucesso) throw new Error(r.mensagem)
    expect(r.validadeSegundos).toBe(600)
    return { solicitacaoId: r.solicitacaoId, codigo: envios.recuperacao.at(-1)!.codigo }
  }

  it('vale aos 9:59 e não pode ser reutilizado', async () => {
    const pedido = await pedir()
    avancar(9 * MIN + 59_000)
    expect((await verificarCodigoRecuperacaoSms(pedido)).sucesso).toBe(true)
    expect((await verificarCodigoRecuperacaoSms(pedido)).sucesso).toBe(false)
  })

  it('expira aos 10:01', async () => {
    const pedido = await pedir()
    avancar(10 * MIN + 1_000)
    expect((await verificarCodigoRecuperacaoSms(pedido)).sucesso).toBe(false)
  })

  it('incorreto é recusado; 5 erros bloqueiam mesmo dentro dos 10 min; reenvio antes de 60 s não envia', async () => {
    const pedido = await pedir()
    const errado = String((Number(pedido.codigo) + 1) % 1_000_000).padStart(6, '0')
    let ultima
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO; i++) ultima = await verificarCodigoRecuperacaoSms({ ...pedido, codigo: errado })
    expect(ultima).toMatchObject({ sucesso: false, bloqueado: true })
    expect((await verificarCodigoRecuperacaoSms(pedido)).sucesso).toBe(false)
    avancar(30_000)
    await solicitarCodigoRecuperacaoSms({ celular: CELULAR_RECUPERACAO })
    expect(envios.recuperacao).toHaveLength(1)
  })
})

describe('código SMS — verificação do celular', () => {
  async function pedir() {
    entrarComo(sessaoVerificacao)
    const r = await solicitarCodigoVerificacaoCelular()
    if (!r.sucesso) throw new Error(r.mensagem)
    expect(r.validadeSegundos).toBe(600)
    return { solicitacaoId: r.solicitacaoId, codigo: envios.verificacao.at(-1)!.codigo }
  }

  it('expira aos 10:01', async () => {
    const pedido = await pedir()
    avancar(10 * MIN + 1_000)
    expect((await confirmarCodigoVerificacaoCelular(pedido)).sucesso).toBe(false)
  })

  it('vale aos 9:59', async () => {
    const pedido = await pedir()
    avancar(9 * MIN + 59_000)
    expect((await confirmarCodigoVerificacaoCelular(pedido)).sucesso).toBe(true)
    expect((await confirmarCodigoVerificacaoCelular(pedido)).sucesso).toBe(false)
  })
})

describe('código SMS — cadastro por celular', () => {
  async function pedir() {
    const r = await solicitarCodigoCadastroSms({ celular: CELULAR_CADASTRO })
    if (!r.sucesso) throw new Error(r.mensagem)
    expect(r.validadeSegundos).toBe(600)
    return { solicitacaoId: r.solicitacaoId, codigo: envios.cadastro.at(-1)!.codigo }
  }

  it('expira aos 10:01', async () => {
    const pedido = await pedir()
    avancar(10 * MIN + 1_000)
    expect((await verificarCodigoCadastroSms(pedido)).sucesso).toBe(false)
  })

  it('vale aos 9:59 e conclui o cadastro', async () => {
    // Libera o intervalo de 60 s contado na auditoria (horário real do banco).
    await db.delete(eventosAuditoria).where(sql`${eventosAuditoria.acao} like 'cadastro_celular_%'`)
    const pedido = await pedir()
    avancar(9 * MIN + 59_000)
    const v = await verificarCodigoCadastroSms(pedido)
    expect(v.sucesso).toBe(true)
    if (v.sucesso) {
      expect(await concluirCadastroPorCelular({ tokenCadastro: v.tokenCadastro, nome: 'Prazo Cadastro Celular', senha: 'senhaPrazo123', perfilTipo: 'cliente' })).toMatchObject({ sucesso: true })
    }
  })
})
