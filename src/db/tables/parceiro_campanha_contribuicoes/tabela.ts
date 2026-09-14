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
import { parceiroCampanhas } from '../parceiro_campanhas/tabela'
import { parceiros } from '../parceiros/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Cada fato de negócio que contou para a meta de um parceiro numa campanha.
 *
 * ## Uma vez por campanha, com origem identificável
 *
 * `(campanha_id, origem_tipo, origem_id)` é único: o mesmo pagamento, a mesma
 * assinatura ou o mesmo serviço concluído não entram duas vezes na mesma meta —
 * processar de novo esbarra no índice. O mesmo fato pode contar em campanhas
 * diferentes: a trava é dentro da campanha, não global.
 *
 * - `assinatura_ativada` — a assinatura originada pelo parceiro foi ativada;
 * - `servico_avulso_concluido` — a comissão avulsa do serviço foi liberada;
 * - `pagamento_assinatura` — dinheiro confirmado de assinatura originada.
 *
 * ## Revertida, nunca apagada
 *
 * Quando o fato deixa de valer (pagamento estornado), a linha vira
 * `revertida`: o progresso cai e a história fica.
 */
export const parceiroCampanhaContribuicoes = pgTable(
  'parceiro_campanha_contribuicoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campanhaId: uuid('campanha_id')
      .notNull()
      .references(() => parceiroCampanhas.id),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    origemTipo: varchar('origem_tipo', { length: 40 }).notNull(),
    origemId: uuid('origem_id').notNull(),
    /** O cliente do fato: é por ele que "novos clientes" não conta duas vezes. */
    clienteUsuarioId: uuid('cliente_usuario_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    valorCentavos: integer('valor_centavos').notNull().default(0),
    ocorridoEm: timestamp('ocorrido_em').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('valida'),
    revertidaEm: timestamp('revertida_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    origemUnica: uniqueIndex('parceiro_campanha_contribuicoes_origem_unica').on(
      t.campanhaId,
      t.origemTipo,
      t.origemId,
    ),
    doParceiroIdx: index('parceiro_campanha_contribuicoes_parceiro_idx').on(
      t.campanhaId,
      t.parceiroId,
      t.status,
    ),
    origemValida: check(
      'parceiro_campanha_contribuicoes_origem_valida',
      sql`${t.origemTipo} in ('assinatura_ativada', 'servico_avulso_concluido', 'pagamento_assinatura')`,
    ),
    valorValido: check('parceiro_campanha_contribuicoes_valor_valido', sql`${t.valorCentavos} >= 0`),
    statusValido: check(
      'parceiro_campanha_contribuicoes_status_valido',
      sql`${t.status} in ('valida', 'revertida')`,
    ),
    reversaoCoerente: check(
      'parceiro_campanha_contribuicoes_reversao_coerente',
      sql`(${t.status} = 'revertida') = (${t.revertidaEm} is not null)`,
    ),
  }),
)
