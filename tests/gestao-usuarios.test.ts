import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfis, sessoesUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { listarUsuariosGestao } from '@/features/usuarios/actions/listar-usuarios-gestao'
import { entrarComo, sairDaSessao } from './setup/sessao'

const MARCA = 'listagem.gestao'
const SUFIXO = `@${MARCA}.teste`

type Fixture = {
  chave: string
  emailVerificado: boolean
  whatsappVerificado: boolean
}

/** Uma conta por combinação de verificação, mais volume para paginar. */
const FIXTURES: Fixture[] = [
  { chave: 'gestor', emailVerificado: true, whatsappVerificado: false },
  { chave: 'sem-verificacao', emailVerificado: false, whatsappVerificado: false },
  { chave: 'por-email', emailVerificado: true, whatsappVerificado: false },
  { chave: 'por-whatsapp', emailVerificado: false, whatsappVerificado: true },
  { chave: 'pelos-dois', emailVerificado: true, whatsappVerificado: true },
  ...Array.from({ length: 8 }, (_, i) => ({
    chave: `volume-${i}`,
    emailVerificado: false,
    whatsappVerificado: false,
  })),
]

let tokenGestor = ''
let gestorId = ''

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db
    .update(usuarios)
    .set({ whatsappVerificadoPorId: null })
    .where(inArray(usuarios.whatsappVerificadoPorId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

beforeAll(async () => {
  await limpar()
  for (const nome of ['gestor_vincis', 'profissional']) {
    await db.insert(perfis).values({ nome }).onConflictDoNothing()
  }
  const [perfilGestor] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'gestor_vincis'))
    .limit(1)
  const [perfilProfissional] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'profissional'))
    .limit(1)

  let indice = 0
  for (const fixture of FIXTURES) {
    const ehGestor = fixture.chave === 'gestor'
    const [usuario] = await db
      .insert(usuarios)
      .values({
        // Prefixo comum: o filtro de busca é por nome/e-mail.
        nome: `ZZListagem ${fixture.chave}`,
        email: `${fixture.chave}${SUFIXO}`,
        whatsapp: `1195000${String(indice).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status:
          fixture.emailVerificado || fixture.whatsappVerificado
            ? 'ativo'
            : 'pendente_email',
        emailVerificado: fixture.emailVerificado,
        emailVerificadoEm: fixture.emailVerificado ? new Date() : null,
        whatsappVerificado: fixture.whatsappVerificado,
        whatsappVerificadoEm: fixture.whatsappVerificado ? new Date() : null,
      })
      .returning({ id: usuarios.id })

    await db.insert(usuariosPerfis).values({
      usuarioId: usuario.id,
      perfilId: ehGestor ? perfilGestor.id : perfilProfissional.id,
    })

    if (ehGestor) {
      gestorId = usuario.id
      const { token, hash } = gerarTokenSessao()
      tokenGestor = token
      await db.insert(sessoesUsuario).values({
        usuarioId: usuario.id,
        tokenHash: hash,
        expiraEm: new Date(Date.now() + 3600_000),
        userAgent: MARCA,
      })
    }
    indice += 1
  }

  // As contas verificadas por WhatsApp registram o gestor como responsável.
  await db
    .update(usuarios)
    .set({ whatsappVerificadoPorId: gestorId })
    .where(eq(usuarios.whatsappVerificado, true))
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

const BASE = {
  busca: 'ZZListagem',
  perfil: 'todos',
  profissao: 'todos',
  modalidade: 'todos',
  status: 'todos',
  statusProfissional: 'todos',
  emailVerificado: 'todos',
  verificacao: 'todos',
  empresa: '',
  pagina: 1,
  porPagina: 10,
}

describe('acesso à listagem', () => {
  it('só o Gestor Vincis carrega a lista', async () => {
    sairDaSessao()
    expect((await listarUsuariosGestao(BASE)).sucesso).toBe(false)
  })
})

describe('dados de verificação na listagem', () => {
  it('traz WhatsApp, método e responsável pela confirmação', async () => {
    entrarComo(tokenGestor)
    const resultado = await listarUsuariosGestao({ ...BASE, porPagina: 50 })
    expect(resultado.sucesso).toBe(true)

    const porWhatsapp = resultado.usuarios.find((u) =>
      u.email.startsWith('por-whatsapp'),
    )!
    expect(porWhatsapp.whatsappVerificado).toBe(true)
    expect(porWhatsapp.emailVerificado).toBe(false)
    expect(porWhatsapp.whatsapp).toMatch(/^1195000/)
    expect(porWhatsapp.whatsappVerificadoEm).not.toBeNull()
    expect(porWhatsapp.whatsappVerificadoPor).toContain('gestor')
  })

  it('conta verificada só por e-mail não ganha marca de WhatsApp', async () => {
    entrarComo(tokenGestor)
    const resultado = await listarUsuariosGestao({ ...BASE, porPagina: 50 })
    const porEmail = resultado.usuarios.find((u) =>
      u.email.startsWith('por-email'),
    )!
    expect(porEmail.emailVerificado).toBe(true)
    expect(porEmail.whatsappVerificado).toBe(false)
    expect(porEmail.whatsappVerificadoPor).toBeNull()
  })
})

describe('filtro por método de verificação', () => {
  it('não verificada traz apenas quem não tem nenhum método', async () => {
    entrarComo(tokenGestor)
    const resultado = await listarUsuariosGestao({
      ...BASE,
      verificacao: 'nao_verificada',
      porPagina: 50,
    })
    expect(resultado.sucesso).toBe(true)
    const lista = resultado.usuarios
    expect(lista.length).toBeGreaterThan(0)
    for (const usuario of lista) {
      expect(usuario.emailVerificado).toBe(false)
      expect(usuario.whatsappVerificado).toBe(false)
    }
  })

  it('e-mail traz quem confirmou o e-mail', async () => {
    entrarComo(tokenGestor)
    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      verificacao: 'email',
      porPagina: 50,
    })
    expect(lista.length).toBeGreaterThan(0)
    for (const usuario of lista) expect(usuario.emailVerificado).toBe(true)
  })

  it('whatsapp traz quem foi confirmado pela Gestão', async () => {
    entrarComo(tokenGestor)
    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      verificacao: 'whatsapp',
      porPagina: 50,
    })
    expect(lista.length).toBeGreaterThan(0)
    for (const usuario of lista) expect(usuario.whatsappVerificado).toBe(true)
    expect(lista.map((u) => u.email)).toEqual(
      expect.arrayContaining([`por-whatsapp${SUFIXO}`, `pelos-dois${SUFIXO}`]),
    )
  })

  it('todos continua trazendo o conjunto completo', async () => {
    entrarComo(tokenGestor)
    const { total } = await listarUsuariosGestao({ ...BASE, porPagina: 50 })
    expect(total).toBe(FIXTURES.length)
  })
})

describe('paginação preservada', () => {
  it('divide o resultado e mantém a contagem total', async () => {
    entrarComo(tokenGestor)
    const primeira = await listarUsuariosGestao({ ...BASE, porPagina: 5, pagina: 1 })
    expect(primeira.sucesso).toBe(true)
    expect(primeira.usuarios).toHaveLength(5)
    expect(primeira.total).toBe(FIXTURES.length)
    expect(primeira.totalPaginas).toBe(Math.ceil(FIXTURES.length / 5))

    const segunda = await listarUsuariosGestao({ ...BASE, porPagina: 5, pagina: 2 })
    expect(segunda.pagina).toBe(2)
    const idsPrimeira = primeira.usuarios.map((u) => u.id)
    for (const usuario of segunda.usuarios) {
      expect(idsPrimeira).not.toContain(usuario.id)
    }
  })

  it('paginação e filtro funcionam juntos', async () => {
    entrarComo(tokenGestor)
    // `porPagina` mínimo é 5 no schema; abaixo disso a busca é recusada.
    const filtrada = await listarUsuariosGestao({
      ...BASE,
      verificacao: 'nao_verificada',
      porPagina: 5,
      pagina: 1,
    })
    expect(filtrada.sucesso).toBe(true)
    expect(filtrada.usuarios).toHaveLength(5)
    expect(filtrada.total).toBeLessThan(FIXTURES.length)
    for (const usuario of filtrada.usuarios) {
      expect(usuario.emailVerificado).toBe(false)
      expect(usuario.whatsappVerificado).toBe(false)
    }
  })

  it('recusa parâmetro de paginação inválido em vez de devolver lista vazia silenciosa', async () => {
    entrarComo(tokenGestor)
    const resultado = await listarUsuariosGestao({ ...BASE, porPagina: 3 })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toMatch(/inválida/i)
  })

  it('filtro de busca continua funcionando', async () => {
    entrarComo(tokenGestor)
    const { usuarios: lista } = await listarUsuariosGestao({
      ...BASE,
      busca: 'por-whatsapp',
      porPagina: 50,
    })
    expect(lista).toHaveLength(1)
    expect(lista[0].email).toBe(`por-whatsapp${SUFIXO}`)
  })
})
