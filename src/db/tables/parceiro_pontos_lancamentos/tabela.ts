import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { parceiroCampanhaRecompensas } from '../parceiro_campanha_recompensas/tabela'
import { parceiroCampanhas } from '../parceiro_campanhas/tabela'
import { parceiros } from '../parceiros/tabela'

/**
 * O extrato de pontos do parceiro — lançamentos imutáveis.
 *
 * Pontos não são dinheiro: não há valor em reais, saque, resgate nem
 * expiração. O saldo é a soma dos lançamentos. Nenhum lançamento é apagado ou
 * alterado: a reversão é um lançamento negativo que aponta para o original
 * (`lancamento_revertido_id`, único), e por isso estornar duas vezes não
 * estorna em dobro. Um crédito por recompensa, garantido pelo índice parcial.
 *
 * A origem (campanha, recompensa) fica na linha, para que um ranking futuro
 * possa somar por período ou por campanha sem depender deste módulo.
 */
export const parceiroPontosLancamentos = pgTable(
  'parceiro_pontos_lancamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    pontos: integer('pontos').notNull(),
    tipo: varchar('tipo', { length: 20 }).notNull(),
    campanhaId: uuid('campanha_id').references(() => parceiroCampanhas.id),
    recompensaId: uuid('recompensa_id').references(() => parceiroCampanhaRecompensas.id),
    lancamentoRevertidoId: uuid('lancamento_revertido_id').references(
      (): AnyPgColumn => parceiroPontosLancamentos.id,
    ),
    descricao: varchar('descricao', { length: 160 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    creditoPorRecompensa: uniqueIndex('parceiro_pontos_credito_por_recompensa')
      .on(t.recompensaId)
      .where(sql`tipo = 'credito'`),
    reversaoUnica: uniqueIndex('parceiro_pontos_reversao_unica')
      .on(t.lancamentoRevertidoId)
      .where(sql`lancamento_revertido_id is not null`),
    doParceiroIdx: index('parceiro_pontos_parceiro_idx').on(t.parceiroId, t.createdAt),
    tipoCoerente: check(
      'parceiro_pontos_tipo_coerente',
      sql`(${t.tipo} = 'credito' and ${t.pontos} > 0 and ${t.lancamentoRevertidoId} is null)
        or (${t.tipo} = 'reversao' and ${t.pontos} < 0 and ${t.lancamentoRevertidoId} is not null)`,
    ),
  }),
)
