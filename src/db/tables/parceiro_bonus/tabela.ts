import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { parceiroCampanhaRecompensas } from '../parceiro_campanha_recompensas/tabela'
import { parceiroCampanhas } from '../parceiro_campanhas/tabela'
import { parceiros } from '../parceiros/tabela'

/**
 * Bônus em dinheiro de campanha — não é comissão.
 *
 * Mora fora de `parceiro_comissoes` de propósito: comissão é um percentual
 * sobre um negócio; bônus é um valor fixo por meta atingida. Os dois entram no
 * mesmo saldo e no mesmo saque (`parceiro_saque_itens.bonus_id`), e cada item
 * de saque diz de qual dos dois veio.
 *
 * `disponivel` → entra no saldo livre; `paga` → saiu num saque pago;
 * `cancelada` → a meta deixou de estar sustentada antes do pagamento. Já pago
 * e invalidado depois: continua `paga`, com `compensacao_pendente_em`.
 */
export const parceiroBonus = pgTable(
  'parceiro_bonus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recompensaId: uuid('recompensa_id')
      .notNull()
      .references(() => parceiroCampanhaRecompensas.id),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    campanhaId: uuid('campanha_id')
      .notNull()
      .references(() => parceiroCampanhas.id),
    valorCentavos: integer('valor_centavos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('disponivel'),
    disponivelEm: timestamp('disponivel_em').notNull(),
    pagaEm: timestamp('paga_em'),
    canceladaEm: timestamp('cancelada_em'),
    compensacaoPendenteEm: timestamp('compensacao_pendente_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    umPorRecompensa: uniqueIndex('parceiro_bonus_recompensa_unica').on(t.recompensaId),
    doParceiroIdx: index('parceiro_bonus_parceiro_idx').on(t.parceiroId, t.status),
    valorPositivo: check('parceiro_bonus_valor_positivo', sql`${t.valorCentavos} > 0`),
    statusValido: check(
      'parceiro_bonus_status_valido',
      sql`${t.status} in ('disponivel', 'paga', 'cancelada')`,
    ),
    pagamentoCoerente: check(
      'parceiro_bonus_pagamento_coerente',
      sql`(${t.status} = 'paga') = (${t.pagaEm} is not null)`,
    ),
    cancelamentoCoerente: check(
      'parceiro_bonus_cancelamento_coerente',
      sql`(${t.status} = 'cancelada') = (${t.canceladaEm} is not null)`,
    ),
  }),
)
