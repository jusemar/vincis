import { aplicarMigrations } from './aplicar-migrations'
import { derrubarPostgres, subirPostgres } from './postgres-descartavel'

/**
 * `globalSetup` do Vitest: sobe o banco descartável e aplica as migrations uma
 * única vez para toda a suíte.
 */
export async function setup() {
  const url = await subirPostgres()
  await aplicarMigrations(url)
}

export async function teardown() {
  await derrubarPostgres()
}
