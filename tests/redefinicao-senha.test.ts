import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, isNull, like } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '@/db/connection'
import { sessoesUsuario, tokensUsuario, usuarios } from '@/db/schema'
import { gerarHash, compararHash } from '@/features/usuarios/lib/hash-senha'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { solicitarRedefinicaoSenha } from '@/features/usuarios/actions/solicitar-redefinicao-senha'
import { redefinirSenha } from '@/features/usuarios/actions/redefinir-senha'

vi.mock('@/integracoes/email/enviar-redefinicao-senha-email', () => ({
  enviarEmailRedefinicaoSenha: vi.fn().mockResolvedValue({ sucesso: true, id: 'email-teste' }),
}))

const MARCA = 'redefinicao.senha'
const SUFIXO = `@${MARCA}.teste`
const SENHA_ORIGINAL = 'senhaAntiga123'

let usuarioId = ''

async function limpar() {
  const alvos = await db.select({ id: usuarios.id }).from(usuarios).where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(sessoesUsuario).where(eq(sessoesUsuario.usuarioId, ids[0]))
  await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, ids[0]))
  await db.delete(usuarios).where(eq(usuarios.id, ids[0]))
}

beforeAll(async () => {
  await limpar()
  const [usuario] = await db
    .insert(usuarios)
    .values({
      nome: 'Teste Redefinicao',
      email: `conta${SUFIXO}`,
      senhaHash: await gerarHash(SENHA_ORIGINAL),
      status: 'ativo',
      emailVerificado: true,
    })
    .returning({ id: usuarios.id })
  usuarioId = usuario.id
})

afterAll(async () => {
  await limpar()
})

beforeEach(() => {
  vi.clearAllMocks()
})

async function criarTokenExpirado() {
  const token = 'token-expirado-teste-0000000000000000000000000000000000000000'
  const hash = createHash('sha256').update(token).digest('hex')
  await db.insert(tokensUsuario).values({
    usuarioId,
    tipo: 'recuperacao_senha',
    tokenHash: hash,
    expiraEm: new Date(Date.now() - 1000),
  })
  return token
}

describe('solicitarRedefinicaoSenha', () => {
  it('cria token e mostra mensagem genérica para usuário existente', async () => {
    const resultado = await solicitarRedefinicaoSenha({ emailOuWhatsapp: `conta${SUFIXO}` })
    expect(resultado.sucesso).toBe(true)
    expect(resultado.mensagem).toMatch(/se existir uma conta/i)

    const [tokenCriado] = await db
      .select()
      .from(tokensUsuario)
      .where(and(eq(tokensUsuario.usuarioId, usuarioId), eq(tokensUsuario.tipo, 'recuperacao_senha')))
    expect(tokenCriado).toBeDefined()
    expect(tokenCriado.usadoEm).toBeNull()
  })

  it('retorna a mesma mensagem genérica para e-mail inexistente (evita enumeração)', async () => {
    const resultado = await solicitarRedefinicaoSenha({
      emailOuWhatsapp: `naoexiste${SUFIXO}`,
    })
    expect(resultado.sucesso).toBe(true)
    expect(resultado.mensagem).toMatch(/se existir uma conta/i)
  })
})

describe('redefinirSenha', () => {
  it('rejeita token expirado', async () => {
    const token = await criarTokenExpirado()
    const resultado = await redefinirSenha({ token, novaSenha: 'novaSenha123' })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toMatch(/inválido ou expirado/i)
  })

  it('rejeita senha inválida (menor que o mínimo)', async () => {
    const resultado = await redefinirSenha({ token: 'qualquer', novaSenha: '123' })
    expect(resultado.sucesso).toBe(false)
  })

  it('fluxo completo: gera token, redefine a senha, invalida o token e permite login com a nova senha', async () => {
    // Remove tokens dos testes anteriores: o rate-limit de reenvio olha o
    // `createdAt` mais recente independentemente de já terem sido usados.
    await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, usuarioId))

    const { token: tokenSessaoAntiga, hash: hashSessaoAntiga } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId,
      tokenHash: hashSessaoAntiga,
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    })

    const solicitacao = await solicitarRedefinicaoSenha({ emailOuWhatsapp: `conta${SUFIXO}` })
    expect(solicitacao.sucesso).toBe(true)

    const [tokenCriado] = await db
      .select()
      .from(tokensUsuario)
      .where(
        and(
          eq(tokensUsuario.usuarioId, usuarioId),
          eq(tokensUsuario.tipo, 'recuperacao_senha'),
          isNull(tokensUsuario.usadoEm),
        ),
      )
    expect(tokenCriado).toBeDefined()

    const { enviarEmailRedefinicaoSenha } = await import(
      '@/integracoes/email/enviar-redefinicao-senha-email'
    )
    expect(enviarEmailRedefinicaoSenha).toHaveBeenCalledTimes(1)
    const tokenBruto = (enviarEmailRedefinicaoSenha as ReturnType<typeof vi.fn>).mock.calls[0][0].token

    const novaSenha = 'senhaNovaSegura456'
    const redefinicao = await redefinirSenha({ token: tokenBruto, novaSenha })
    expect(redefinicao.sucesso).toBe(true)

    const reuso = await redefinirSenha({ token: tokenBruto, novaSenha: 'outraSenha789' })
    expect(reuso.sucesso).toBe(false)
    expect(reuso.mensagem).toMatch(/inválido ou expirado/i)

    const [usuarioAtualizado] = await db
      .select({ senhaHash: usuarios.senhaHash })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
    expect(await compararHash(novaSenha, usuarioAtualizado.senhaHash)).toBe(true)
    expect(await compararHash(SENHA_ORIGINAL, usuarioAtualizado.senhaHash)).toBe(false)

    const [sessaoAntiga] = await db
      .select({ encerradaEm: sessoesUsuario.encerradaEm })
      .from(sessoesUsuario)
      .where(eq(sessoesUsuario.tokenHash, hashSessaoAntiga))
    expect(sessaoAntiga.encerradaEm).not.toBeNull()
  })
})
