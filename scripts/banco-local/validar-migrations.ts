/**
 * Valida a cadeia inteira de migrations do zero, no PostgreSQL LOCAL.
 *
 * Cria um banco temporário `vincis_migrations_test_<instante>` no mesmo servidor
 * local, aplica todas as migrations com o `drizzle-kit migrate` (a mesma
 * ferramenta da migration online), confere o resultado e apaga só esse banco —
 * aconteça o que acontecer. Nunca cria branch no Neon.
 *
 * Uso: npm run db:local:validar-migrations
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'
import { rodarDrizzleKit } from './drizzle'
import { exigirBancoLocal } from './guarda'

type Journal = { entries: { idx: number; tag: string }[] }

const base = exigirBancoLocal(process.env.DATABASE_URL, 'validar-migrations')
const nome = `vincis_migrations_test_${Date.now()}`
const manutencao = new URL(base)
manutencao.pathname = '/postgres'
const alvo = new URL(base)
alvo.pathname = `/${nome}`

const journal: Journal = JSON.parse(
  await readFile(path.resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
)
const esperadas = journal.entries.length
const ultima = [...journal.entries].sort((a, b) => a.idx - b.idx).at(-1)?.tag

const admin = postgres(manutencao.toString(), { max: 1 })
let falhou = false
try {
  await admin.unsafe(`create database "${nome}"`)
  console.log(`Banco temporário criado: ${nome}`)
  await rodarDrizzleKit(['migrate'], alvo.toString())

  const sql = postgres(alvo.toString(), { max: 1 })
  try {
    const [{ aplicadas }] = await sql<{ aplicadas: number }[]>`
      select count(*)::int as aplicadas from drizzle.__drizzle_migrations`
    const [{ tabelas }] = await sql<{ tabelas: number }[]>`
      select count(*)::int as tabelas from information_schema.tables where table_schema = 'public'`
    const [{ versoes }] = await sql<{ versoes: number }[]>`
      select count(*)::int as versoes from parceiro_nivel_configuracoes`
    const [{ regras }] = await sql<{ regras: number }[]>`
      select count(*)::int as regras from parceiro_nivel_regras`
    console.log({ esperadas, aplicadas, ultima, tabelas, versoesDeNivel: versoes, regrasDeNivel: regras })
    if (aplicadas !== esperadas) throw new Error(`Aplicadas ${aplicadas} de ${esperadas} migrations.`)
    if (versoes < 1 || regras < 1) throw new Error('Configuração inicial de níveis ausente.')
    console.log('Cadeia de migrations válida do zero.')
  } finally {
    await sql.end({ timeout: 5 })
  }
} catch (erro) {
  falhou = true
  console.error('FALHOU:', erro instanceof Error ? erro.message : erro)
} finally {
  await admin.unsafe(`drop database if exists "${nome}" with (force)`)
  console.log(`Banco temporário removido: ${nome}`)
  await admin.end({ timeout: 5 })
}
process.exit(falhou ? 1 : 0)
