import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { parceiroCampanhas } from '../parceiro_campanhas/tabela'
import { parceiros } from '../parceiros/tabela'

/**
 * A recompensa que um parceiro ganhou numa campanha.
 *
 * Nasce uma vez, quando a meta é atingida com fatos válidos: o índice parcial
 * `(campanha_id, parceiro_id) where status = 'concedida'` é quem garante isso,
 * inclusive com duas transações atingindo a meta juntas. Bônus e pontos ficam
 * copiados aqui. O dinheiro vira `parceiro_bonus`; os pontos, um lançamento em
 * `parceiro_pontos_lancamentos`.
 *
 * Se a meta deixa de estar sustentada antes de o dinheiro ser pago, a
 * recompensa vira `revertida` (bônus cancelado, pontos estornados por
 * lançamento negativo). Se o dinheiro já foi pago, ela continua `concedida` e
 * `compensacao_pendente_em` sinaliza o ajuste futuro — nenhum débito automático.
 */
export const parceiroCampanhaRecompensas = pgTable(
  'parceiro_campanha_recompensas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campanhaId: uuid('campanha_id')
      .notNull()
      .references(() => parceiroCampanhas.id),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    bonusCentavos: integer('bonus_centavos').notNull(),
    pontos: integer('pontos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('concedida'),
    concedidaEm: timestamp('concedida_em').notNull(),
    revertidaEm: timestamp('revertida_em'),
    motivoReversao: varchar('motivo_reversao', { length: 60 }),
    compensacaoPendenteEm: timestamp('compensacao_pendente_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    umaConcedida: uniqueIndex('parceiro_campanha_recompensas_concedida_unica')
      .on(t.campanhaId, t.parceiroId)
      .where(sql`status = 'concedida'`),
    valoresValidos: check(
      'parceiro_campanha_recompensas_valores_validos',
      sql`${t.bonusCentavos} >= 0 and ${t.pontos} >= 0 and (${t.bonusCentavos} > 0 or ${t.pontos} > 0)`,
    ),
    statusValido: check(
      'parceiro_campanha_recompensas_status_valido',
      sql`${t.status} in ('concedida', 'revertida')`,
    ),
    reversaoCoerente: check(
      'parceiro_campanha_recompensas_reversao_coerente',
      sql`(${t.status} = 'revertida') = (${t.revertidaEm} is not null)`,
    ),
  }),
)
