/**
 * Dá a um parceiro local N clientes recorrentes novos, pagos pelo caminho real.
 *
 * Serve para validar níveis e campanhas na tela: cada cliente dispara
 * atribuição, recálculo de nível e reconciliação das campanhas publicadas.
 * Só roda contra banco local (guarda), com `SENHA_CONTAS_LOCAIS` em `.env.local`.
 *
 * Uso: npm run db:local:clientes-recorrentes -- parceiro.bronze@vincis.local 3
 */
import { exigirBancoLocal } from './guarda'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:clientes-recorrentes')
const [email, quantidadeTexto] = process.argv.slice(2)
const quantidade = Number(quantidadeTexto)
const senha = process.env.SENHA_CONTAS_LOCAIS
if (!email || !Number.isInteger(quantidade) || quantidade < 1 || !senha) {
  console.error('Uso: npm run db:local:clientes-recorrentes -- <email-do-parceiro> <quantidade> (com SENHA_CONTAS_LOCAIS em .env.local)')
  process.exit(1)
}

const { eq } = await import('drizzle-orm')
const { conexaoPostgres, db } = await import('../../src/db/connection')
const { parceiros, usuarios } = await import('../../src/db/schema')
const { clienteRecorrenteLocal } = await import('./fixtures')

const [parceiro] = await db
  .select({ id: parceiros.id })
  .from(parceiros)
  .innerJoin(usuarios, eq(usuarios.id, parceiros.usuarioId))
  .where(eq(usuarios.email, email))
if (!parceiro) {
  console.error(`Parceiro ativado não encontrado para ${email}.`)
  await conexaoPostgres.end()
  process.exit(1)
}
for (let i = 0; i < quantidade; i++) {
  const { clienteId } = await clienteRecorrenteLocal(parceiro.id, senha)
  console.log(`cliente recorrente criado e pago: ${clienteId.slice(0, 8)}`)
}
await conexaoPostgres.end({ timeout: 5 })
