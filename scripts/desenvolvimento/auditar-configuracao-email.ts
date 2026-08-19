/**
 * Auditoria da configuração de e-mail.
 *
 * Reúne, num só lugar, as evidências que separam as hipóteses possíveis:
 * chave inválida, chave de outra conta, remetente de sandbox, ausência de
 * domínio verificado, domínio verificado em outra conta, variável errada.
 *
 * Nunca imprime o valor de nenhuma chave — apenas presença, tamanho e prefixo
 * de identificação, que não permitem reconstruir o segredo.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/auditar-configuracao-email.ts
 */
import { and, desc, eq, isNotNull, not, sql } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { usuarios } from '../../src/db/schema'

function mascarar(valor: string | undefined) {
  if (!valor) return '(ausente)'
  return `${valor.slice(0, 6)}…${valor.slice(-2)} (${valor.length} caracteres)`
}

console.log('=== VARIÁVEIS CARREGADAS ===')
console.log('RESEND_API_KEY:', mascarar(process.env.RESEND_API_KEY))
console.log('EMAIL_FROM:', process.env.EMAIL_FROM ?? '(ausente)')
console.log('APP_URL:', process.env.APP_URL ?? '(ausente)')
console.log('NODE_ENV:', process.env.NODE_ENV ?? '(indefinido)')

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('Sem chave — auditoria do provedor não é possível.')
  process.exit(1)
}

const cabecalhos = { authorization: `Bearer ${apiKey}` }

console.log('\n=== CONTA DO PROVEDOR ===')
for (const recurso of ['domains', 'api-keys', 'audiences']) {
  const resposta = await fetch(`https://api.resend.com/${recurso}`, {
    headers: cabecalhos,
  })
  const corpo = await resposta.json().catch(() => null)
  // As chaves são listadas por id e nome; o segredo nunca volta pela API.
  console.log(`GET /${recurso} → ${resposta.status}`, JSON.stringify(corpo))
}

console.log('\n=== EVIDÊNCIA HISTÓRICA NO BANCO ===')
console.log('Contas com e-mail confirmado, por domínio e data:')

const confirmados = await db
  .select({
    email: usuarios.email,
    verificadoEm: usuarios.emailVerificadoEm,
    criadoEm: usuarios.createdAt,
  })
  .from(usuarios)
  .where(and(eq(usuarios.emailVerificado, true), isNotNull(usuarios.emailVerificadoEm)))
  .orderBy(desc(usuarios.emailVerificadoEm))

for (const linha of confirmados) {
  const [, dominio] = linha.email.split('@')
  console.log(
    `  ${linha.verificadoEm?.toISOString()}  @${dominio}  (criada ${linha.criadoEm.toISOString()})`,
  )
}
if (!confirmados.length) console.log('  (nenhuma)')

console.log('\nContas pendentes de confirmação, por data de criação:')
const pendentes = await db
  .select({ email: usuarios.email, criadoEm: usuarios.createdAt })
  .from(usuarios)
  .where(not(eq(usuarios.emailVerificado, true)))
  .orderBy(desc(usuarios.createdAt))
  .limit(15)
for (const linha of pendentes) {
  const [, dominio] = linha.email.split('@')
  console.log(`  ${linha.criadoEm.toISOString()}  @${dominio}`)
}
if (!pendentes.length) console.log('  (nenhuma)')

const [resumo] = await db
  .select({
    total: sql<number>`count(*)::int`,
    confirmadas: sql<number>`count(*) filter (where ${usuarios.emailVerificado})::int`,
  })
  .from(usuarios)
console.log('\nTotal de contas:', resumo.total, '| confirmadas:', resumo.confirmadas)

await conexaoPostgres.end({ timeout: 5 })
