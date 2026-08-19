import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, tokensUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { gerarToken } from '@/features/usuarios/lib/gerar-token'

/**
 * O provedor de e-mail é o único ponto simulado: bater no Resend a cada teste
 * enviaria mensagem de verdade. A entrega real é validada à parte, pelo script
 * `scripts/desenvolvimento/testar-envio-confirmacao.ts`. Aqui o que importa é o
 * comportamento do fluxo diante de cada resposta do provedor — em especial que
 * uma falha nunca vire sucesso.
 */
const enviarEmailConfirmacao = vi.hoisted(() => vi.fn())
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { confirmarEmail } = await import('@/features/usuarios/actions/confirmar-email')
const { reenviarConfirmacaoEmail } = await import(
  '@/features/usuarios/actions/reenviar-confirmacao-email'
)
const { resolverAcessoUsuario } = await import(
  '@/features/usuarios/queries/obter-destino-apos-login'
)

const EMAIL = 'colaborador.confirmacao@matriz.teste'

async function criarColaboradorPendente() {
  await limpar()
  await db.insert(perfis).values({ nome: 'colaborador' }).onConflictDoNothing()
  const [perfil] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'colaborador'))
    .limit(1)

  const [usuario] = await db
    .insert(usuarios)
    .values({
      nome: 'Colaborador Pendente',
      email: EMAIL,
      whatsapp: '11970000001',
      senhaHash: 'nao-usado',
      status: 'pendente_email',
      emailVerificado: false,
    })
    .returning({ id: usuarios.id })

  await db
    .insert(usuariosPerfis)
    .values({ usuarioId: usuario.id, perfilId: perfil.id })

  const { token, hash } = gerarToken()
  const expiraEm = new Date()
  expiraEm.setHours(expiraEm.getHours() + 24)
  await db.insert(tokensUsuario).values({
    usuarioId: usuario.id,
    tipo: 'confirmacao_email',
    tokenHash: hash,
    expiraEm,
  })

  return { usuarioId: usuario.id, token }
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

async function tokensDoUsuario(usuarioId: string) {
  return db
    .select({
      id: tokensUsuario.id,
      usadoEm: tokensUsuario.usadoEm,
      createdAt: tokensUsuario.createdAt,
    })
    .from(tokensUsuario)
    .where(
      and(
        eq(tokensUsuario.usuarioId, usuarioId),
        eq(tokensUsuario.tipo, 'confirmacao_email'),
      ),
    )
    .orderBy(desc(tokensUsuario.createdAt))
}

beforeEach(() => {
  enviarEmailConfirmacao.mockReset()
  enviarEmailConfirmacao.mockResolvedValue({ sucesso: true, id: 'id-de-teste' })
})

afterAll(async () => {
  await limpar()
})

describe('confirmação pelo link', () => {
  it('valida o token, ativa a conta e marca o e-mail como verificado', async () => {
    const { usuarioId, token } = await criarColaboradorPendente()

    const resultado = await confirmarEmail({ token })
    expect(resultado.sucesso).toBe(true)

    const [usuario] = await db
      .select({
        status: usuarios.status,
        emailVerificado: usuarios.emailVerificado,
      })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
    expect(usuario.status).toBe('ativo')
    expect(usuario.emailVerificado).toBe(true)
  })

  it('o token não pode ser reutilizado', async () => {
    const { token } = await criarColaboradorPendente()

    expect((await confirmarEmail({ token })).sucesso).toBe(true)
    const segunda = await confirmarEmail({ token })
    expect(segunda.sucesso).toBe(false)
    expect(segunda.mensagem).toContain('inválido')
  })

  it('token inexistente é recusado', async () => {
    await criarColaboradorPendente()
    const resultado = await confirmarEmail({ token: gerarToken().token })
    expect(resultado.sucesso).toBe(false)
  })

  it('o Colaborador confirmado segue para /cadastro-colaborador', async () => {
    const { usuarioId, token } = await criarColaboradorPendente()

    // Antes de confirmar não há destino: conta pendente não navega para lugar nenhum.
    expect(await resolverAcessoUsuario(usuarioId)).toBeNull()

    await confirmarEmail({ token })

    const acesso = await resolverAcessoUsuario(usuarioId)
    expect(acesso?.destino).toBe('/cadastro-colaborador')
    expect(acesso?.tipoPrestador).toBe('colaborador')
    expect(acesso?.habilitado).toBe(false)
  })
})

describe('reenvio', () => {
  it('chama o provedor e conclui quando ele aceita', async () => {
    const { usuarioId } = await criarColaboradorPendente()
    // O token recém-criado ativaria o limite de 1 minuto.
    await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, usuarioId))

    const resultado = await reenviarConfirmacaoEmail({ email: EMAIL })
    expect(resultado.sucesso).toBe(true)
    expect(enviarEmailConfirmacao).toHaveBeenCalledTimes(1)
    expect(enviarEmailConfirmacao.mock.calls[0][0].destinatario).toBe(EMAIL)
  })

  it('não relata sucesso quando o provedor rejeita, e invalida o token gerado', async () => {
    const { usuarioId } = await criarColaboradorPendente()
    await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, usuarioId))
    enviarEmailConfirmacao.mockResolvedValue({ sucesso: false, motivo: 'provedor' })

    const resultado = await reenviarConfirmacaoEmail({ email: EMAIL })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).not.toContain('enviado')

    // Nenhum token válido fica para trás depois de uma falha de envio.
    const tokens = await tokensDoUsuario(usuarioId)
    expect(tokens.every(({ usadoEm }) => usadoEm !== null)).toBe(true)
  })

  it('a mensagem de erro não vaza detalhe técnico nem segredo', async () => {
    const { usuarioId } = await criarColaboradorPendente()
    await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, usuarioId))
    enviarEmailConfirmacao.mockResolvedValue({ sucesso: false, motivo: 'configuracao' })

    const { mensagem } = await reenviarConfirmacaoEmail({ email: EMAIL })
    expect(mensagem).not.toMatch(/re_|api|key|resend|token/i)
  })

  it('respeita o limite de um minuto sem chamar o provedor', async () => {
    await criarColaboradorPendente()

    const resultado = await reenviarConfirmacaoEmail({ email: EMAIL })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toBe(
      'Aguarde um minuto antes de solicitar outro e-mail.',
    )
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled()
  })

  it('passado o intervalo, um novo envio acontece e o token anterior é invalidado', async () => {
    const { usuarioId } = await criarColaboradorPendente()
    // Envelhece o token existente para além da janela de 1 minuto.
    await db
      .update(tokensUsuario)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) })
      .where(eq(tokensUsuario.usuarioId, usuarioId))

    const resultado = await reenviarConfirmacaoEmail({ email: EMAIL })
    expect(resultado.sucesso).toBe(true)
    expect(enviarEmailConfirmacao).toHaveBeenCalledTimes(1)

    const tokens = await tokensDoUsuario(usuarioId)
    expect(tokens).toHaveLength(2)
    // Exatamente um token vivo: o antigo é queimado ao gerar o novo.
    expect(tokens.filter(({ usadoEm }) => usadoEm === null)).toHaveLength(1)
  })

  it('conta já confirmada não gera token nem chama o provedor', async () => {
    const { token } = await criarColaboradorPendente()
    await confirmarEmail({ token })
    enviarEmailConfirmacao.mockClear()

    const resultado = await reenviarConfirmacaoEmail({ email: EMAIL })
    // Resposta genérica de propósito: não revela se a conta existe.
    expect(resultado.sucesso).toBe(true)
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled()
  })

  it('e-mail desconhecido responde igual, sem revelar existência de conta', async () => {
    const resultado = await reenviarConfirmacaoEmail({
      email: 'ninguem.aqui@matriz.teste',
    })
    expect(resultado.sucesso).toBe(true)
    expect(enviarEmailConfirmacao).not.toHaveBeenCalled()
  })
})
