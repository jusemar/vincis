/**
 * Prepara (ou remove) uma conta de Cliente confirmada para a validação visual.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-cliente-visual.ts criar|remover
 */
import { eq, inArray, like } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  perfis,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '../../src/db/schema'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'

const EMAIL = 'cliente.visual@vincis.local'
const SENHA = 'Teste@123456'
const acao = process.argv[2] ?? 'criar'

async function remover() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, EMAIL))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

if (acao === 'remover') {
  await remover()
  console.log('Conta de validação visual removida.')
} else {
  await remover()
  const [perfil] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'cliente'))
    .limit(1)

  const [usuario] = await db
    .insert(usuarios)
    .values({
      nome: 'Marina Souza',
      email: EMAIL,
      whatsapp: '11930001111',
      senhaHash: await gerarHash(SENHA),
      // Confirmada por e-mail: é o caminho normal do Cliente.
      status: 'ativo',
      emailVerificado: true,
      emailVerificadoEm: new Date(),
    })
    .returning({ id: usuarios.id })

  await db
    .insert(usuariosPerfis)
    .values({ usuarioId: usuario.id, perfilId: perfil.id })

  console.log('Conta pronta para validação visual:')
  console.log('  e-mail:', EMAIL)
  console.log('  senha :', SENHA)
}

await conexaoPostgres.end({ timeout: 5 })
