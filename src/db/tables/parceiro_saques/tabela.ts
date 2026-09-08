import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { parceiros } from '../parceiros/tabela'

/**
 * Uma solicitação de saque do parceiro.
 *
 * ## O que ela é, e o que ela não é
 *
 * É o pedido, não o pagamento. Nasce `solicitado` e fica assim: nesta fatia
 * não há Pix, integração bancária, aprovação nem baixa automática — o Gestor
 * tratará o pagamento em etapa própria. Por isso `pago_em` nasce nulo e
 * ninguém o preenche ainda.
 *
 * ## O valor não é a fonte da verdade
 *
 * `valor_centavos` é a soma das comissões reservadas em `parceiro_saque_itens`,
 * copiada aqui para leitura. Quem sustenta o pedido são os itens: guardar só um
 * total agregado deixaria uma solicitação sem origem, e uma contestação sem
 * resposta. Se um dia os dois discordarem, os itens é que valem.
 *
 * ## Estados
 *
 * `solicitado` hoje. `pago`, `recusado` e `cancelado` cabem na mesma coluna
 * quando o fluxo do Gestor existir — o `check` já os aceita para que a fatia
 * seguinte não precise de migração de dados, mas nada nesta escreve neles.
 */
export const parceiroSaques = pgTable(
  'parceiro_saques',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    /** Soma das comissões reservadas. Sempre positiva. */
    valorCentavos: integer('valor_centavos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('solicitado'),
    solicitadoEm: timestamp('solicitado_em').defaultNow().notNull(),
    /** Preenchido quando o Gestor pagar. Nulo enquanto não houver pagamento. */
    pagoEm: timestamp('pago_em'),
    /** Espaço do Gestor para registrar o que decidiu, na etapa futura. */
    observacao: text('observacao'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    doParceiroIdx: index('parceiro_saques_parceiro_idx').on(
      t.parceiroId,
      t.solicitadoEm,
    ),
    // Saque de zero (ou negativo) não é pedido, é erro de cálculo.
    valorPositivo: check(
      'parceiro_saques_valor_positivo',
      sql`${t.valorCentavos} > 0`,
    ),
  }),
)
