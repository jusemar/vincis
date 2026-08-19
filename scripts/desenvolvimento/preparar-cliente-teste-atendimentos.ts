/**
 * Segunda conta de Cliente para desenvolvimento/teste do fluxo de Atendimentos.
 *
 * É uma conta de Cliente e só isso: sem perfil Profissional, sem Colaborador e
 * sem Gestor. Nenhuma conta existente é tocada — o script mexe apenas no e-mail
 * abaixo, que é claramente de teste (`@vincis.local`).
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-cliente-teste-atendimentos.ts criar|remover
 */
import { eq, inArray } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  perfis,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '../../src/db/schema'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'

const NOME = 'Paulo Ribeiro'
const EMAIL = 'cliente.teste.atendimentos@vincis.local'
const SENHA = 'Teste@123456'
const acao = process.argv[2] ?? 'criar'

async function remover() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

if (acao === 'remover') {
  await remover()
  console.log('Conta de teste removida.')
} else {
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL))
    .limit(1)

  if (existente) {
    console.log('Conta de teste já existe:')
  } else {
    const [perfilCliente] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, 'cliente'))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: NOME,
        email: EMAIL,
        whatsapp: '11930002222',
        senhaHash: await gerarHash(SENHA),
        // Já confirmada: é o estado normal de um Cliente que passou pelo
        // e-mail, e o que permite usar a conta imediatamente em teste.
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfilCliente.id })

    console.log('Conta de teste criada:')
  }

  console.log('  nome  :', NOME)
  console.log('  e-mail:', EMAIL)
  console.log('  senha :', SENHA)
}

await conexaoPostgres.end({ timeout: 5 })
