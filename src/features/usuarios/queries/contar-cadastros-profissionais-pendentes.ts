import { count, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'

export async function contarCadastrosProfissionaisPendentes() {
  const [resultado] = await db.select({ total: count() }).from(perfisProfissionais)
    .where(eq(perfisProfissionais.statusAnalise, 'aguardando_analise'))
  return resultado?.total ?? 0
}
