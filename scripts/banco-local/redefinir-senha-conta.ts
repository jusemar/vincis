/**
 * Redefine a senha de UMA conta de demonstração (`@vincis.local`) no banco LOCAL.
 *
 * A senha das contas é guardada só como hash (bcrypt) e não pode ser lida de
 * volta. Para entrar numa conta de demonstração no localhost, este comando
 * grava como senha dela o valor de `SENHA_CONTAS_LOCAIS` (do `.env.local`).
 *
 * Diferente de `db:local:senhas` (que alcança todas as contas `@vincis.local`),
 * mexe em uma conta só, e só com `--confirmar`. Nada mais é tocado: nome,
 * perfis, cadastro, sessões e dados ficam como estão. Nenhuma senha ou hash é
 * impresso.
 *
 * Uso: npm run db:local:senha-conta -- --email demo.profissional.carlos.lima@vincis.local --confirmar
 */
import { exigirBancoLocal } from './guarda'
import { DOMINIO_CONTAS_LOCAIS, lerSenhaContasLocais } from './senha-contas-locais'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:senha-conta')

const argumentos = process.argv.slice(2)
const indiceEmail = argumentos.indexOf('--email')
const email = indiceEmail >= 0 ? argumentos[indiceEmail + 1]?.trim().toLowerCase() : undefined
if (!email || !email.endsWith(DOMINIO_CONTAS_LOCAIS)) {
  console.error(`Informe --email de uma conta de demonstração (${DOMINIO_CONTAS_LOCAIS}).`)
  process.exit(1)
}
if (!argumentos.includes('--confirmar')) {
  console.error(`Nada foi alterado. Para redefinir a senha de ${email}, repita com --confirmar.`)
  process.exit(1)
}
const senha = lerSenhaContasLocais('db:local:senha-conta')

const { eq } = await import('drizzle-orm')
const { conexaoPostgres, db } = await import('../../src/db/connection')
const { usuarios } = await import('../../src/db/schema')
const { gerarHash } = await import('../../src/features/usuarios/lib/hash-senha')

try {
  const [conta] = await db
    .update(usuarios)
    .set({ senhaHash: await gerarHash(senha), updatedAt: new Date() })
    .where(eq(usuarios.email, email))
    .returning({ email: usuarios.email })
  if (!conta) {
    console.error(`Conta ${email} não encontrada no banco local.`)
    process.exitCode = 1
  } else {
    console.log(`Senha de ${conta.email} redefinida para o valor de SENHA_CONTAS_LOCAIS (.env.local).`)
  }
} finally {
  await conexaoPostgres.end({ timeout: 5 })
}
