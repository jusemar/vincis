/**
 * Redefine a senha de UMA conta, sem tocar em nenhum outro campo.
 *
 * Só grava `senha_hash` (e `updated_at`). E-mail, perfis, verificações,
 * contratações e demais dados ficam exatamente como estavam.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/redefinir-senha-conta.ts <email> <senha>
 */
import { eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { usuarios } from '../../src/db/schema'
import { compararHash, gerarHash } from '../../src/features/usuarios/lib/hash-senha'

const [email, senha] = process.argv.slice(2)
if (!email || !senha) {
  console.error('Informe <email> e <senha>.')
  process.exit(1)
}

const [antes] = await db
  .select({
    id: usuarios.id,
    nome: usuarios.nome,
    email: usuarios.email,
    status: usuarios.status,
    emailVerificado: usuarios.emailVerificado,
    whatsappVerificado: usuarios.whatsappVerificado,
    senhaHash: usuarios.senhaHash,
  })
  .from(usuarios)
  .where(eq(usuarios.email, email))
  .limit(1)

if (!antes) {
  console.error(`Conta não encontrada: ${email}`)
  process.exit(1)
}

await db
  .update(usuarios)
  .set({ senhaHash: await gerarHash(senha), updatedAt: new Date() })
  // Por id: garante que só esta linha é alterada.
  .where(eq(usuarios.id, antes.id))

const [depois] = await db
  .select({
    email: usuarios.email,
    status: usuarios.status,
    emailVerificado: usuarios.emailVerificado,
    whatsappVerificado: usuarios.whatsappVerificado,
    senhaHash: usuarios.senhaHash,
  })
  .from(usuarios)
  .where(eq(usuarios.id, antes.id))
  .limit(1)

console.log('conta            :', antes.nome, `<${depois.email}>`)
console.log('e-mail inalterado:', depois.email === antes.email)
console.log('status inalterado:', depois.status === antes.status)
console.log(
  'verificações     :',
  depois.emailVerificado === antes.emailVerificado &&
    depois.whatsappVerificado === antes.whatsappVerificado,
)
console.log('senha confere    :', await compararHash(senha, depois.senhaHash))

await conexaoPostgres.end({ timeout: 5 })
