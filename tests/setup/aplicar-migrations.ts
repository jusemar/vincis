import { readFile } from 'node:fs/promises'
import path from 'node:path'
import postgres from 'postgres'

type Journal = { entries: { idx: number; tag: string }[] }

const RAIZ_MIGRATIONS = path.resolve(process.cwd(), 'drizzle')

/**
 * Aplica as migrations Drizzle em ordem, do jeito que o `drizzle-kit migrate`
 * faria. Rodamos o SQL versionado — e não um `push` do schema — para que a
 * suíte valide exatamente o banco que existe em produção, incluindo índices
 * parciais como `colaboracoes_cliente_vivo_unique`, dos quais as regras de
 * colaboração dependem.
 */
export async function aplicarMigrations(urlBanco: string) {
  const journal: Journal = JSON.parse(
    await readFile(path.join(RAIZ_MIGRATIONS, 'meta', '_journal.json'), 'utf8'),
  )

  const sql = postgres(urlBanco, { max: 1 })
  try {
    for (const entrada of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
      const conteudo = await readFile(
        path.join(RAIZ_MIGRATIONS, `${entrada.tag}.sql`),
        'utf8',
      )
      // O separador é o mesmo que o drizzle-kit grava entre statements.
      for (const comando of conteudo.split('--> statement-breakpoint')) {
        const limpo = comando.trim()
        if (limpo) await sql.unsafe(limpo)
      }
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
