/**
 * Separa as confirmações históricas entre o endereço do dono da conta Resend e
 * terceiros — a única pergunta que decide se o projeto já entregou para fora do
 * sandbox.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/auditar-destinatarios-confirmados.ts <email-do-dono>
 */
import { desc, isNotNull } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { usuarios } from '../../src/db/schema'

const dono = (process.argv[2] ?? '').toLowerCase()
if (!dono) {
  console.error('Informe o e-mail dono da conta Resend.')
  process.exit(1)
}

/** Mostra o suficiente para reconhecer a conta sem publicar o endereço inteiro. */
function ofuscar(email: string) {
  const [local, dominio] = email.split('@')
  const visivel = local.slice(0, 3)
  return `${visivel}${'*'.repeat(Math.max(local.length - 3, 0))}@${dominio}`
}

const linhas = await db
  .select({
    email: usuarios.email,
    criadoEm: usuarios.createdAt,
    verificadoEm: usuarios.emailVerificadoEm,
  })
  .from(usuarios)
  .where(isNotNull(usuarios.emailVerificadoEm))
  .orderBy(desc(usuarios.emailVerificadoEm))

console.log('Dono da conta Resend:', ofuscar(dono))
console.log(
  '\nconfirmadas (endereços reais, fora de domínios de teste .local/.com de fixture):\n',
)

const REAIS = /@(gmail|hotmail|outlook|yahoo|icloud|live|bol|uol|terra)\./i

for (const linha of linhas) {
  if (!REAIS.test(linha.email)) continue
  const ehDono = linha.email.toLowerCase() === dono
  const intervaloSegundos = linha.verificadoEm
    ? Math.round(
        (linha.verificadoEm.getTime() - linha.criadoEm.getTime()) / 1000,
      )
    : null
  console.log(
    [
      linha.verificadoEm?.toISOString(),
      ehDono ? 'DONO DA CONTA' : 'TERCEIRO     ',
      ofuscar(linha.email).padEnd(28),
      `criada→confirmada: ${intervaloSegundos}s`,
    ].join('  '),
  )
}

await conexaoPostgres.end({ timeout: 5 })
