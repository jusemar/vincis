import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { parceiroNiveis } from '../parceiro_niveis/tabela'
import { parceiros } from '../parceiros/tabela'

/**
 * Cada mudança de nível de um parceiro, com o porquê.
 *
 * `motivo`: `inicial` (o primeiro cálculo, na base), `subida_por_clientes`,
 * `queda_apos_protecao` ou `mudanca_configuracao` (a contagem não mudou; a
 * regra publicada pela Gestão, sim). `protegido_ate` é a proteção concedida
 * nesta mudança; `protecao_anterior_ate`, a que tinha acabado quando caiu.
 */
export const parceiroNivelHistorico = pgTable(
  'parceiro_nivel_historico',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    nivelAnterior: varchar('nivel_anterior', { length: 20 }).references(
      () => parceiroNiveis.codigo,
    ),
    nivelNovo: varchar('nivel_novo', { length: 20 })
      .notNull()
      .references(() => parceiroNiveis.codigo),
    clientesAtivos: integer('clientes_ativos').notNull(),
    motivo: varchar('motivo', { length: 30 }).notNull(),
    protegidoAte: timestamp('protegido_ate'),
    protecaoAnteriorAte: timestamp('protecao_anterior_ate'),
    configuracaoVersao: integer('configuracao_versao').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    doParceiroIdx: index('parceiro_nivel_historico_parceiro_idx').on(
      t.parceiroId,
      t.createdAt,
    ),
    motivoValido: check(
      'parceiro_nivel_historico_motivo_valido',
      sql`${t.motivo} in ('inicial', 'subida_por_clientes', 'queda_apos_protecao', 'mudanca_configuracao')`,
    ),
  }),
)
