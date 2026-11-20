import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, like, or, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { db } from '@/db/connection'
import { cadastrosCelular, eventosAuditoria, perfis, sessoesUsuario, tokensUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as cadastrarPorEmail } from '@/app/api/auth/cadastro/route'
import { solicitarAdicaoEmail } from '@/features/usuarios/actions/adicionar-email'
import { concluirCadastroPorCelular, solicitarCodigoCadastroSms, verificarCodigoCadastroSms } from '@/features/usuarios/actions/cadastro-celular'
import { confirmarEmail } from '@/features/usuarios/actions/confirmar-email'
import { solicitarCodigoRecuperacaoSms, verificarCodigoRecuperacaoSms } from '@/features/usuarios/actions/recuperacao-senha-sms'
import { redefinirSenha } from '@/features/usuarios/actions/redefinir-senha'
import { solicitarRedefinicaoSenha } from '@/features/usuarios/actions/solicitar-redefinicao-senha'
import { MAXIMO_TENTATIVAS_CODIGO, MENSAGEM_CODIGO_BLOQUEADO, MENSAGEM_CODIGO_INVALIDO, MENSAGEM_RECUPERACAO_SMS } from '@/features/usuarios/constants/recuperacao-senha'
import { gerarHash } from '@/features/usuarios/lib/hash-senha'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { montarMensagemCodigoCadastro, MENSAGEM_CELULAR_JA_CADASTRADO } from '@/integracoes/sms/mensagens-cadastro-sms'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Cadastro por celular (código por SMS), login e recuperação com a conta sem
 * e-mail, e o e-mail adicionado depois. Provedores sempre simulados.
 */

const envios = vi.hoisted(() => ({
  codigos: [] as { celularNacional: string; codigo: string }[],
  jaCadastrado: [] as string[],
  recuperacao: [] as { celularNacional: string; codigo: string }[],
  emails: [] as { destinatario: string; token: string }[],
}))

vi.mock('@/integracoes/sms/mensagens-cadastro-sms', async (original) => ({
  ...(await original<typeof import('@/integracoes/sms/mensagens-cadastro-sms')>()),
  enviarSmsCodigoCadastro: vi.fn(async (d: { celularNacional: string; codigo: string }) => {
    envios.codigos.push(d)
    return { sucesso: true }
  }),
  enviarSmsCelularJaCadastrado: vi.fn(async (d: { celularNacional: string }) => {
    envios.jaCadastrado.push(d.celularNacional)
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
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao: vi.fn(async (d: { destinatario: string; token: string }) => {
    envios.emails.push(d)
    return { sucesso: true, id: 'email-teste' }
  }),
}))

const SUFIXO = '@cadastro-celular.teste'
const CELULAR = '31987651001'
const CELULAR_EXISTENTE = '31987651002'
const NOME = 'Pessoa Cadastro Celular'
let contaExistenteId = ''

function requisicao(rota: string, corpo: unknown) {
  return new NextRequest(new Request(`https://vincis.test${rota}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }))
}

async function idsDeTeste() {
  const linhas = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(or(like(usuarios.email, `%${SUFIXO}`), like(usuarios.nome, `${NOME}%`), like(usuarios.emailPendente, `%${SUFIXO}`)))
  return linhas.map(({ id }) => id)
}

async function limpar() {
  const ids = await idsDeTeste()
  if (ids.length) {
    await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
    await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
    await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
    await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
    await db.delete(usuarios).where(inArray(usuarios.id, ids))
  }
  await db.delete(cadastrosCelular).where(inArray(cadastrosCelular.celular, [CELULAR, CELULAR_EXISTENTE, '31987651003', '31987651004', '31987651005']))
  await db.delete(eventosAuditoria).where(sql`${eventosAuditoria.acao} like 'cadastro_celular_%' or ${eventosAuditoria.acao} like 'recuperacao_senha_%' or ${eventosAuditoria.acao} like 'email_adicional_%' or ${eventosAuditoria.acao} = 'conta_criada_por_celular'`)
}

/** Libera um novo pedido: o anterior "aconteceu" há 2 minutos e os limites zeram. */
async function liberarNovoPedido() {
  await db.update(cadastrosCelular).set({ createdAt: sql`now() - interval '2 minutes'` })
  await db.update(tokensUsuario).set({ createdAt: sql`now() - interval '2 minutes'` })
  await db.delete(eventosAuditoria).where(sql`${eventosAuditoria.acao} like 'cadastro_celular_%' or ${eventosAuditoria.acao} like 'recuperacao_senha_%'`)
}

async function pedirCodigo(celular = '(31) 98765-1001') {
  const r = await solicitarCodigoCadastroSms({ celular })
  if (!r.sucesso) throw new Error(r.mensagem)
  return { solicitacaoId: r.solicitacaoId, codigo: envios.codigos.at(-1)?.codigo ?? '' }
}

async function cadastrarPorCelular(senha = 'senhaCelular123', perfilTipo: 'cliente' | 'profissional' = 'cliente') {
  const { solicitacaoId, codigo } = await pedirCodigo()
  const v = await verificarCodigoCadastroSms({ solicitacaoId, codigo })
  if (!v.sucesso) throw new Error(v.mensagem)
  return { token: v.tokenCadastro, conclusao: await concluirCadastroPorCelular({ tokenCadastro: v.tokenCadastro, nome: NOME, senha, perfilTipo }) }
}

const errado = (certo: string) => String((Number(certo) + 1) % 1_000_000).padStart(6, '0')

beforeAll(async () => {
  await limpar()
  // O banco de testes só traz os perfis que os testes criam (mesma regra de `criarContas`).
  for (const nome of ['cliente', 'profissional', 'colaborador']) await db.insert(perfis).values({ nome }).onConflictDoNothing()
  const [conta] = await db
    .insert(usuarios)
    .values({
      nome: 'Conta antiga com celular',
      email: `antiga${SUFIXO}`,
      whatsapp: '(31) 98765-1002', // gravado com máscara, como cadastros antigos
      whatsappVerificado: false,
      senhaHash: await gerarHash('senhaAntiga123'),
      status: 'ativo',
      emailVerificado: true,
    })
    .returning({ id: usuarios.id })
  contaExistenteId = conta.id
})

beforeEach(async () => {
  envios.codigos.length = 0
  envios.jaCadastrado.length = 0
  envios.recuperacao.length = 0
  envios.emails.length = 0
  sairDaSessao()
  await liberarNovoPedido()
})

afterAll(limpar)

describe('cadastro por celular', () => {
  it('envia código de 6 dígitos (sem link) e responde com prazos e o aviso de 1 minuto', async () => {
    const r = await solicitarCodigoCadastroSms({ celular: '+55 (31) 98765-1001' })
    expect(r).toMatchObject({ sucesso: true, mensagem: MENSAGEM_RECUPERACAO_SMS, aguardarSegundos: 60, validadeSegundos: 600 })
    expect(envios.codigos).toHaveLength(1)
    expect(envios.codigos[0]).toMatchObject({ celularNacional: CELULAR })
    expect(envios.codigos[0].codigo).toMatch(/^\d{6}$/)
    const mensagem = montarMensagemCodigoCadastro(envios.codigos[0].codigo)
    expect(mensagem.length).toBeLessThanOrEqual(160)
    expect(mensagem).toMatch(/^[\x20-\x7E]+$/)
    expect(mensagem).not.toMatch(/https?:/)
    // Código só como hash.
    const [linha] = await db.select().from(cadastrosCelular).where(eq(cadastrosCelular.celular, CELULAR))
    expect(linha.codigoHash).not.toContain(envios.codigos[0].codigo)
  })

  it('código errado, expirado e bloqueio após 5 erros; solicitação inexistente igual', async () => {
    const { solicitacaoId, codigo } = await pedirCodigo()
    expect(await verificarCodigoCadastroSms({ solicitacaoId, codigo: errado(codigo) })).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO, bloqueado: false })
    for (let i = 1; i < MAXIMO_TENTATIVAS_CODIGO; i++) await verificarCodigoCadastroSms({ solicitacaoId, codigo: errado(codigo) })
    expect(await verificarCodigoCadastroSms({ solicitacaoId, codigo })).toEqual({ sucesso: false, mensagem: MENSAGEM_CODIGO_BLOQUEADO, bloqueado: true })

    await liberarNovoPedido()
    const segundo = await pedirCodigo()
    await db.update(cadastrosCelular).set({ expiraEm: sql`now() - interval '1 second'` }).where(eq(cadastrosCelular.id, segundo.solicitacaoId))
    expect(await verificarCodigoCadastroSms(segundo)).toMatchObject({ sucesso: false, mensagem: MENSAGEM_CODIGO_INVALIDO })

    let ultima
    for (let i = 0; i < MAXIMO_TENTATIVAS_CODIGO; i++) ultima = await verificarCodigoCadastroSms({ solicitacaoId: crypto.randomUUID(), codigo: '000000' })
    expect(ultima).toMatchObject({ sucesso: false })
  })

  it('reenvio só depois de 60 s; o código novo invalida o anterior', async () => {
    const primeiro = await pedirCodigo()
    await solicitarCodigoCadastroSms({ celular: CELULAR })
    expect(envios.codigos).toHaveLength(1) // dentro de 60 s: nenhum SMS
    await liberarNovoPedido()
    const segundo = await pedirCodigo()
    expect(envios.codigos).toHaveLength(2)
    expect((await verificarCodigoCadastroSms(primeiro)).sucesso).toBe(false)
    expect((await verificarCodigoCadastroSms(segundo)).sucesso).toBe(true)
  })

  it('número já cadastrado: mesma resposta na tela, aviso só no SMS do dono e nenhum código vale', async () => {
    const r = await solicitarCodigoCadastroSms({ celular: CELULAR_EXISTENTE })
    expect(r).toMatchObject({ sucesso: true, mensagem: MENSAGEM_RECUPERACAO_SMS, aguardarSegundos: 60, validadeSegundos: 600 })
    expect(envios.codigos).toHaveLength(0)
    expect(envios.jaCadastrado).toEqual([CELULAR_EXISTENTE])
    expect(MENSAGEM_CELULAR_JA_CADASTRADO.length).toBeLessThanOrEqual(160)
    if (r.sucesso) expect((await verificarCodigoCadastroSms({ solicitacaoId: r.solicitacaoId, codigo: '123456' })).sucesso).toBe(false)
    // A conta antiga não muda (nem é verificada pelo pedido).
    const [antiga] = await db.select({ v: usuarios.whatsappVerificado }).from(usuarios).where(eq(usuarios.id, contaExistenteId))
    expect(antiga.v).toBe(false)
  })

  it('conclui: conta sem e-mail, celular verificado, ativa, com o perfil escolhido; autorização de uso único', async () => {
    const { token, conclusao } = await cadastrarPorCelular('senhaCelular123', 'profissional')
    expect(conclusao).toEqual({ sucesso: true, celular: CELULAR })
    const [conta] = await db.select().from(usuarios).where(eq(usuarios.whatsapp, CELULAR))
    expect(conta).toMatchObject({ email: null, nome: NOME, whatsappVerificado: true, whatsappVerificadoPorId: null, emailVerificado: false, status: 'ativo' })
    const papeis = await db.select({ nome: perfis.nome }).from(usuariosPerfis).innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId)).where(eq(usuariosPerfis.usuarioId, conta.id))
    expect(papeis.map((p) => p.nome)).toEqual(['profissional'])
    expect((await concluirCadastroPorCelular({ tokenCadastro: token, nome: NOME, senha: 'outraSenha123', perfilTipo: 'cliente' })).sucesso).toBe(false)
  })

  it('corrida: número tomado por outra conta depois do código certo não gera segunda conta', async () => {
    const { solicitacaoId, codigo } = await pedirCodigo('(31) 98765-1005')
    const v = await verificarCodigoCadastroSms({ solicitacaoId, codigo })
    expect(v.sucesso).toBe(true)
    // Outra conta grava o mesmo número (com máscara) antes da conclusão.
    await db.insert(usuarios).values({ nome: `${NOME} Corrida`, email: `corrida${SUFIXO}`, whatsapp: '(31) 98765-1005', senhaHash: 'x', status: 'ativo' })
    if (!v.sucesso) return
    expect(await concluirCadastroPorCelular({ tokenCadastro: v.tokenCadastro, nome: NOME, senha: 'senhaCelular123', perfilTipo: 'cliente' })).toMatchObject({ sucesso: false, recomecar: true })
    const contas = await db.select({ id: usuarios.id }).from(usuarios).where(sql`regexp_replace(${usuarios.whatsapp}, '[^0-9]', '', 'g') = '31987651005'`)
    expect(contas).toHaveLength(1)
  })
})

describe('conta criada pelo celular: login, recuperação e e-mail depois', () => {
  async function sessaoDaConta() {
    const [conta] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.whatsapp, CELULAR))
    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({ usuarioId: conta.id, tokenHash: hash, expiraEm: new Date(Date.now() + 3_600_000) })
    return { id: conta.id, token }
  }

  it('entra com celular (qualquer formato) e senha', async () => {
    for (const celular of ['(31) 98765-1001', '+55 31 98765-1001']) {
      const r = await login(requisicao('/api/auth/login', { emailOuWhatsapp: celular, senha: 'senhaCelular123' }))
      expect(r.status).toBe(200)
    }
    expect((await login(requisicao('/api/auth/login', { emailOuWhatsapp: CELULAR, senha: 'errada12345' }))).status).toBe(401)
  })

  it('recupera a senha por código SMS; recuperação por e-mail não alcança conta sem e-mail', async () => {
    const pedido = await solicitarCodigoRecuperacaoSms({ celular: CELULAR })
    expect(pedido.sucesso && envios.recuperacao).toHaveLength(1)
    if (!pedido.sucesso) return
    const ok = await verificarCodigoRecuperacaoSms({ solicitacaoId: pedido.solicitacaoId, codigo: envios.recuperacao[0].codigo })
    expect(ok.sucesso).toBe(true)
    if (ok.sucesso) expect(await redefinirSenha({ token: ok.tokenRedefinicao, novaSenha: 'senhaNovaCelular1' })).toMatchObject({ sucesso: true })
    expect((await login(requisicao('/api/auth/login', { emailOuWhatsapp: CELULAR, senha: 'senhaNovaCelular1' }))).status).toBe(200)
  })

  it('adiciona e-mail com confirmação própria: só vale depois do link; celular nunca valida e-mail', async () => {
    const { id, token } = await sessaoDaConta()
    entrarComo(token)
    expect(await solicitarAdicaoEmail({ email: `Novo${SUFIXO}` })).toMatchObject({ sucesso: true })
    let [conta] = await db.select().from(usuarios).where(eq(usuarios.id, id))
    expect(conta).toMatchObject({ email: null, emailPendente: `novo${SUFIXO}`, emailVerificado: false })
    expect(envios.emails).toHaveLength(1)
    expect(envios.emails[0].destinatario).toBe(`novo${SUFIXO}`)

    expect(await confirmarEmail({ token: envios.emails[0].token })).toMatchObject({ sucesso: true })
    ;[conta] = await db.select().from(usuarios).where(eq(usuarios.id, id))
    expect(conta).toMatchObject({ email: `novo${SUFIXO}`, emailPendente: null, emailVerificado: true, whatsappVerificado: true, status: 'ativo' })
    // Link de uso único.
    expect((await confirmarEmail({ token: envios.emails[0].token })).sucesso).toBe(false)
    // Com e-mail, a conta não troca por aqui.
    expect((await solicitarAdicaoEmail({ email: `outro${SUFIXO}` })).sucesso).toBe(false)
    // E agora também entra e recupera pelo e-mail.
    expect((await login(requisicao('/api/auth/login', { emailOuWhatsapp: `novo${SUFIXO}`, senha: 'senhaNovaCelular1' }))).status).toBe(200)
    expect(await solicitarRedefinicaoSenha({ emailOuWhatsapp: `novo${SUFIXO}` })).toMatchObject({ sucesso: true, canal: 'email' })
  })

  it('e-mail de outra conta: mesma resposta e nenhum link', async () => {
    const [outra] = await db
      .insert(usuarios)
      .values({ nome: `${NOME} B`, whatsapp: '31987651003', whatsappVerificado: true, senhaHash: await gerarHash('senhaB12345'), status: 'ativo' })
      .returning({ id: usuarios.id })
    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({ usuarioId: outra.id, tokenHash: hash, expiraEm: new Date(Date.now() + 3_600_000) })
    entrarComo(token)
    expect(await solicitarAdicaoEmail({ email: `antiga${SUFIXO}` })).toMatchObject({ sucesso: true })
    expect(envios.emails).toHaveLength(0)
  })
})

describe('compatibilidade', () => {
  it('cadastro por e-mail continua igual (conta pendente + link de confirmação)', async () => {
    const r = await cadastrarPorEmail(
      requisicao('/api/auth/cadastro', { nome: `${NOME} Email`, email: `porEmail${SUFIXO}`, whatsapp: '(31) 98765-1004', senha: 'senhaEmail123', perfilTipo: 'cliente' }),
    )
    expect(r.status).toBe(201)
    const [conta] = await db.select().from(usuarios).where(eq(usuarios.email, `porEmail${SUFIXO}`))
    expect(conta).toMatchObject({ status: 'pendente_email', emailVerificado: false, whatsapp: '31987651004' })
    expect(envios.emails).toHaveLength(1)
  })

  it('banco recusa conta sem e-mail e sem celular', async () => {
    await expect(
      db.insert(usuarios).values({ nome: `${NOME} Vazia`, senhaHash: 'x', status: 'ativo' }),
    ).rejects.toThrow()
  })
})
