import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, isNull, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { eventosAuditoria, sessoesUsuario, tokensUsuario, usuarios } from '@/db/schema'
import { redefinirSenha } from '@/features/usuarios/actions/redefinir-senha'
import { solicitarCodigoRecuperacaoSms, verificarCodigoRecuperacaoSms } from '@/features/usuarios/actions/recuperacao-senha-sms'
import { solicitarRedefinicaoSenha } from '@/features/usuarios/actions/solicitar-redefinicao-senha'
import {
  MAXIMO_TENTATIVAS_CODIGO,
  MENSAGEM_CODIGO_BLOQUEADO,
  MENSAGEM_CODIGO_INVALIDO,
  MENSAGEM_RECUPERACAO_EMAIL,
  MENSAGEM_RECUPERACAO_SMS,
} from '@/features/usuarios/constants/recuperacao-senha'
import { compararHash, gerarHash } from '@/features/usuarios/lib/hash-senha'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { hashIdentificador, ipExcedeErrosDeCodigo, recuperacaoExcedeLimites } from '@/features/usuarios/lib/limite-recuperacao'
import { formatarCelularDigitado, normalizarCelularBR } from '@/features/usuarios/lib/telefone'
import { buscarUsuarioPorLogin } from '@/features/usuarios/queries/buscar-usuario-por-login'
import { whatsappSchema } from '@/features/usuarios/schemas/base'
import { enviarSmsComtele } from '@/integracoes/sms/comtele'
import { montarMensagemCodigoSms } from '@/integracoes/sms/enviar-codigo-redefinicao-sms'

/**
 * Recuperação de senha: código OTP por SMS (Comtele) e link por e-mail.
 * Provedores sempre simulados — nenhum SMS ou e-mail real sai daqui.
 */

const envios = vi.hoisted(() => ({
  sms: [] as { celularNacional: string; codigo: string }[],
  email: [] as { destinatario: string; token: string }[],
  falharSms: false,
}))

vi.mock('@/integracoes/sms/enviar-codigo-redefinicao-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/enviar-codigo-redefinicao-sms')>()),
  enviarSmsCodigoRedefinicao: vi.fn(async (dados: { celularNacional: string; codigo: string }) => {
    envios.sms.push(dados)
    return envios.falharSms ? { sucesso: false, motivo: 'recusado' } : { sucesso: true }
  }),
}))
vi.mock('@/integracoes/email/enviar-redefinicao-senha-email', () => ({
  enviarEmailRedefinicaoSenha: vi.fn(async (dados: { destinatario: string; token: string }) => {
    envios.email.push(dados)
    return { sucesso: true, id: 'email-teste' }
  }),
}))

const SUFIXO = '@recuperacao-sms.teste'
const CONTAS = {
  verificado: { whatsapp: '31987650001', verificado: true },
  mascarado: { whatsapp: '(31) 98765-0002', verificado: true },
  naoVerificado: { whatsapp: '31987650003', verificado: false },
  duplicadoA: { whatsapp: '31987650004', verificado: true },
  duplicadoB: { whatsapp: '+55 (31) 98765-0004', verificado: true },
} as const
type Chave = keyof typeof CONTAS
const ids = {} as Record<Chave, string>
const UUID = /^[0-9a-f-]{36}$/

async function limpar() {
  const alvos = await db.select({ id: usuarios.id }).from(usuarios).where(like(usuarios.email, `%${SUFIXO}`))
  const lista = alvos.map(({ id }) => id)
  if (lista.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, lista))
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, lista))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, lista))
    await db.delete(usuarios).where(inArray(usuarios.id, lista))
  }
  await db.delete(eventosAuditoria).where(like(eventosAuditoria.acao, 'recuperacao_senha_%'))
}

/** O pedido anterior "aconteceu" há 2 minutos e os limites zeram. */
async function liberarNovoPedido() {
  await db.update(tokensUsuario).set({ createdAt: sql`now() - interval '2 minutes'` })
  await db.delete(eventosAuditoria).where(like(eventosAuditoria.acao, 'recuperacao_senha_%'))
}

async function pedirCodigo(celular = '(31) 98765-0001') {
  const r = await solicitarCodigoRecuperacaoSms({ celular })
  if (!r.sucesso) throw new Error(r.mensagem)
  return { solicitacaoId: r.solicitacaoId, codigo: envios.sms.at(-1)?.codigo ?? '' }
}

const codigoErrado = (certo: string) => String((Number(certo) + 1) % 1_000_000).padStart(6, '0')

beforeAll(async () => {
  await limpar()
  const senhaHash = await gerarHash('senhaAntiga123')
  for (const [chave, conta] of Object.entries(CONTAS) as [Chave, (typeof CONTAS)[Chave]][]) {
    const [linha] = await db
      .insert(usuarios)
      .values({
        nome: `Conta ${chave}`,
        email: `${chave.toLowerCase()}${SUFIXO}`,
        whatsapp: conta.whatsapp,
        whatsappVerificado: conta.verificado,
        senhaHash,
        status: 'ativo',
        emailVerificado: true,
      })
      .returning({ id: usuarios.id })
    ids[chave] = linha.id
  }
})

beforeEach(async () => {
  envios.sms.length = 0
  envios.email.length = 0
  envios.falharSms = false
  await liberarNovoPedido()
})

afterAll(limpar)

describe('telefone: uma regra só', () => {
  it('normaliza qualquer máscara e recusa fixo/inválido', () => {
    for (const entrada of ['(31) 98765-0001', '31 98765-0001', '+55 31 98765-0001', '5531987650001', '031987650001']) {
      expect(normalizarCelularBR(entrada)).toBe('31987650001')
    }
    expect(normalizarCelularBR('(31) 3222-1111')).toBeNull()
    expect(normalizarCelularBR('123')).toBeNull()
    expect(formatarCelularDigitado('31987650001')).toBe('(31) 98765-0001')
  })

  it('cadastro e dados da conta gravam só dígitos', () => {
    expect(whatsappSchema.parse('(31) 98765-0001')).toBe('31987650001')
    expect(whatsappSchema.safeParse('3222-1111').success).toBe(false)
  })

  it('login reconhece o número em qualquer formato; número em duas contas não identifica ninguém', async () => {
    expect((await buscarUsuarioPorLogin('+55 (31) 98765-0001'))?.id).toBe(ids.verificado)
    expect((await buscarUsuarioPorLogin('31987650002'))?.id).toBe(ids.mascarado)
    expect(await buscarUsuarioPorLogin('(31) 98765-0004')).toBeNull()
    expect((await buscarUsuarioPorLogin(`VERIFICADO${SUFIXO}`))?.id).toBe(ids.verificado)
  })
})

describe('código por SMS', () => {
  it('celular verificado recebe código de 6 dígitos (nunca link); resposta com prazos e aviso', async () => {
    for (const entrada of ['(31) 98765-0001', '+55 31 98765-0001', '031 98765 0001']) {
      await liberarNovoPedido()
      const r = await solicitarCodigoRecuperacaoSms({ celular: entrada })
      expect(r).toMatchObject({ sucesso: true, canal: 'sms', mensagem: MENSAGEM_RECUPERACAO_SMS, aguardarSegundos: 60, validadeSegundos: 600 })
      if (r.sucesso) expect(r.solicitacaoId).toMatch(UUID)
    }
    expect(envios.sms.map((e) => e.celularNacional)).toEqual(['31987650001', '31987650001', '31987650001'])
    for (const { codigo } of envios.sms) expect(codigo).toMatch(/^\d{6}$/)
    expect(envios.email).toHaveLength(0)
  })

  it('o código nunca é gravado em claro', async () => {
    const { solicitacaoId, codigo } = await pedirCodigo()
    const [linha] = await db.select().from(tokensUsuario).where(eq(tokensUsuario.id, solicitacaoId))
    expect(linha.tokenHash).not.toContain(codigo)
    expect(linha.expiraEm.getTime() - linha.createdAt.getTime()).toBeLessThanOrEqual(10 * 60_000 + 2_000)
  })

  it('número antigo gravado com máscara também recebe', async () => {
    await pedirCodigo('31987650002')
    expect(envios.sms).toHaveLength(1)
  })

  it('número não verificado, inexistente ou duplicado: sem SMS, mesma resposta, e nenhum código vale', async () => {
    for (const celular of ['31987650003', '31987659999', '31987650004']) {
      await liberarNovoPedido()
      const r = await solicitarCodigoRecuperacaoSms({ celular })
      expect(r).toMatchObject({ sucesso: true, canal: 'sms', mensagem: MENSAGEM_RECUPERACAO_SMS, aguardarSegundos: 60, validadeSegundos: 600 })
      if (r.sucesso) {
        expect(r.solicitacaoId).toMatch(UUID)
        expect(await verificarCodigoRecuperacaoSms({ solicitacaoId: r.solicitacaoId, codigo: '123456' })).toEqual({
          sucesso: false,
          mensagem: MENSAGEM_CODIGO_INVALIDO,
          bloqueado: false,
        })
      }
    }
    expect(envios.sms).toHaveLength(0)
    // Pedir recuperação não verifica número nenhum.
    const [conta] = await db.select({ v: usuarios.whatsappVerificado }).from(usuarios).where(eq(usuarios.id, ids.naoVerificado))
    expect(conta.v).toBe(false)
  })

  it('código certo libera a nova senha: senha salva, sessões encerradas, código e autorização de uso único', async () => {
    await db.insert(sessoesUsuario).values({ usuarioId: ids.verificado, tokenHash: gerarTokenSessao().hash, expiraEm: new Date(Date.now() + 3_600_000) })
    const { solicitacaoId, codigo } = await pedirCodigo()
    const ok = await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })
    expect(ok.sucesso).toBe(true)
    if (!ok.sucesso) return

    // Código já usado não vale de novo.
    expect(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })).toMatchObject({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO })

    expect(await redefinirSenha({ token: ok.tokenRedefinicao, novaSenha: 'senhaNova456' })).toMatchObject({ sucesso: true })
    const [conta] = await db.select({ hash: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, ids.verificado))
    expect(await compararHash('senhaNova456', conta.hash)).toBe(true)
    const abertas = await db.select().from(sessoesUsuario).where(and(eq(sessoesUsuario.usuarioId, ids.verificado), isNull(sessoesUsuario.encerradaEm)))
    expect(abertas).toHaveLength(0)
    // Autorização não pode ser reutilizada.
    expect(await redefinirSenha({ token: ok.tokenRedefinicao, novaSenha: 'outraSenha789' })).toMatchObject({ sucesso: false })
  })

  it('código incorreto é recusado; o certo ainda vale dentro do limite', async () => {
    const { solicitacaoId, codigo } = await pedirCodigo()
    expect(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo: codigoErrado(codigo) })).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false })
    expect((await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })).sucesso).toBe(true)
  })

  it(`${MAXIMO_TENTATIVAS_CODIGO} erros invalidam o código, mesmo que depois venha o certo`, async () => {
    const { solicitacaoId, codigo } = await pedirCodigo()
    const respostas = []
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO; i++) respostas.push(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo: codigoErrado(codigo) }))
    expect(respostas.at(-1)).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true })
    expect(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })).toMatchObject({ sucesso: false, bloqueado: true })
    const [linha] = await db.select().from(tokensUsuario).where(eq(tokensUsuario.id, solicitacaoId))
    expect(linha.usadoEm).not.toBeNull()
  })

  it('solicitação inexistente também bloqueia após os mesmos erros (sem diferença de resposta)', async () => {
    const solicitacaoId = crypto.randomUUID()
    let ultima
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO; i++) ultima = await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo: '000000' })
    expect(ultima).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true })
  })

  it('código expirado (5 minutos) é recusado', async () => {
    const { solicitacaoId, codigo } = await pedirCodigo()
    await db.update(tokensUsuario).set({ expiraEm: sql`now() - interval '1 second'` }).where(eq(tokensUsuario.id, solicitacaoId))
    expect(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })).toMatchObject({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO })
  })

  it('novo código (após 60 s) invalida o anterior', async () => {
    const primeiro = await pedirCodigo()
    await db.update(tokensUsuario).set({ createdAt: sql`now() - interval '2 minutes'` })
    const segundo = await pedirCodigo()
    expect(envios.sms).toHaveLength(2)
    expect((await verificarCodigoRecuperacaoSms(primeiro)).sucesso).toBe(false)
    expect((await verificarCodigoRecuperacaoSms(segundo)).sucesso).toBe(true)
  })

  it('reenvio antes de 60 s não manda outro SMS (resposta igual)', async () => {
    await pedirCodigo()
    const segundo = await solicitarCodigoRecuperacaoSms({ celular: '31987650001' })
    expect(segundo).toMatchObject({ sucesso: true, aguardarSegundos: 60 })
    expect(envios.sms).toHaveLength(1)
  })

  it('falha da Comtele invalida o código e nada sensível vai para log', async () => {
    envios.falharSms = true
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { solicitacaoId, codigo } = await pedirCodigo()
    const registrado = JSON.stringify(espiao.mock.calls)
    espiao.mockRestore()
    expect(await verificarCodigoRecuperacaoSms({ solicitacaoId, codigo })).toMatchObject({ sucesso: false })
    expect(registrado).not.toContain(codigo)
    expect(registrado).not.toContain('31987650001')
  })

  it('formato impossível é recusado na hora', async () => {
    expect((await solicitarCodigoRecuperacaoSms({ celular: '123' })).sucesso).toBe(false)
    expect((await verificarCodigoRecuperacaoSms({ solicitacaoId: crypto.randomUUID(), codigo: '12a' })).sucesso).toBe(false)
    expect(envios.sms).toHaveLength(0)
  })
})

describe('limites', () => {
  it('por identificador: o 4º pedido em 15 min é limitado, mesmo sem conta; identificador nunca em claro', async () => {
    for (let i = 0; i < 4; i++) await solicitarCodigoRecuperacaoSms({ celular: '31987658888' })
    const eventos = await db.select({ m: eventosAuditoria.metadados }).from(eventosAuditoria).where(eq(eventosAuditoria.acao, 'recuperacao_senha_solicitada'))
    expect(eventos.map((e) => (e.m as { resultado: string }).resultado)).toEqual(['ignorado', 'ignorado', 'ignorado', 'limitado'])
    expect(JSON.stringify(eventos)).not.toContain('31987658888')
  })

  it('por IP: pedidos e erros de código em excesso bloqueiam o IP', async () => {
    const ip = '203.0.113.7'
    await db.insert(eventosAuditoria).values(
      Array.from({ length: 10 }, () => ({ acao: 'recuperacao_senha_solicitada', entidade: 'usuarios', origem: 'sistema', ip, metadados: { identificadorHash: 'outro' } })),
    )
    expect(await recuperacaoExcedeLimites(ip, hashIdentificador('sms:31987650001'))).toBe(true)
    expect(await recuperacaoExcedeLimites('203.0.113.8', hashIdentificador('sms:31987650001'))).toBe(false)

    await db.insert(eventosAuditoria).values(
      Array.from({ length: 30 }, () => ({ acao: 'recuperacao_senha_codigo_incorreto', entidade: 'tokens_usuario', origem: 'sistema', ip })),
    )
    expect(await ipExcedeErrosDeCodigo(ip)).toBe(true)
    expect(await ipExcedeErrosDeCodigo('203.0.113.8')).toBe(false)
  })
})

describe('e-mail continua com link', () => {
  it('e-mail cadastrado recebe o link; celular no campo de e-mail aponta para o SMS', async () => {
    const r = await solicitarRedefinicaoSenha({ emailOuWhatsapp: `Verificado${SUFIXO}` })
    expect(r).toMatchObject({ sucesso: true, canal: 'email', mensagem: MENSAGEM_RECUPERACAO_EMAIL })
    expect(envios.email).toHaveLength(1)
    expect(envios.email[0].token).toHaveLength(64)
    expect(await redefinirSenha({ token: envios.email[0].token, novaSenha: 'senhaPeloEmail1' })).toMatchObject({ sucesso: true })
    expect((await solicitarRedefinicaoSenha({ emailOuWhatsapp: '31987650001' })).sucesso).toBe(false)
    expect(envios.sms).toHaveLength(0)
  })
})

describe('integração Comtele (provedor falso)', () => {
  const configuracao = (resposta: Response | Error) => ({
    chaveApi: 'chave-secreta-de-teste',
    rota: 17,
    buscar: (async () => {
      if (resposta instanceof Error) throw resposta
      return resposta
    }) as typeof fetch,
  })
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })

  it('só confirma com hasError=false; recusa, HTTP, rede e falta de configuração viram falha', async () => {
    expect(await enviarSmsComtele('5531987650001', 'oi', configuracao(json({ hasError: false })))).toEqual({ sucesso: true })
    expect(await enviarSmsComtele('5531987650001', 'oi', configuracao(json({ hasError: true })))).toMatchObject({ motivo: 'recusado' })
    expect(await enviarSmsComtele('5531987650001', 'oi', configuracao(json({}, 500)))).toMatchObject({ motivo: 'http' })
    expect(await enviarSmsComtele('5531987650001', 'oi', configuracao(json({ ok: 1 })))).toMatchObject({ motivo: 'resposta_invalida' })
    expect(await enviarSmsComtele('5531987650001', 'oi', configuracao(new Error('rede')))).toMatchObject({ motivo: 'rede' })
    expect(await enviarSmsComtele('5531987650001', 'oi', null)).toMatchObject({ motivo: 'configuracao' })
  })

  it('nunca registra a chave, o telefone nem a mensagem em log', async () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await enviarSmsComtele('5531987650001', 'codigo-secreto', configuracao(json({ hasError: true }, 400)))
    const registrado = JSON.stringify(espiao.mock.calls)
    espiao.mockRestore()
    expect(registrado).not.toContain('chave-secreta-de-teste')
    expect(registrado).not.toContain('5531987650001')
    expect(registrado).not.toContain('codigo-secreto')
  })

  it('mensagem do código: 1 SMS, sem acentos, sem link', () => {
    const mensagem = montarMensagemCodigoSms('123456')
    expect(mensagem).toBe('Vincis: seu codigo para redefinir a senha e 123456. Valido por 10 minutos. Nao compartilhe.')
    expect(mensagem.length).toBeLessThanOrEqual(160)
    expect(mensagem).toMatch(/^[\x20-\x7E]+$/)
    expect(mensagem).not.toMatch(/https?:/)
  })
})
