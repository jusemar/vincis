import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString)

export const db = drizzle(client, { schema })

/**
 * Conexão subjacente. Exposta para que processos de vida curta (scripts de
 * desenvolvimento e a suíte de testes) possam encerrá-la explicitamente — sem
 * isso, conexões ociosas ficam abertas até o processo morrer e o banco
 * descartável dos testes é removido debaixo delas, gerando ECONNRESET no fim
 * da execução. A aplicação em si nunca precisa chamar isto.
 */
export const conexaoPostgres = client
