import { sql } from 'drizzle-orm'
import { check, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { parceiroNiveis } from '../parceiro_niveis/tabela'
import { parceiros } from '../parceiros/tabela'

/**
 * O nível atual de cada parceiro.
 *
 * Persistido porque a proteção contra queda depende de memória: "subiu em 01/10
 * e está protegido até 31/10" não se deduz da contagem de hoje. É refeito sob
 * demanda — ao gerar comissão, ao confirmar ou estornar pagamento de assinatura
 * atribuída e ao abrir o painel —, sempre com a linha travada, e é idempotente.
 *
 * `configuracao_versao` diz sob qual versão foi calculado da última vez; o
 * histórico de cada mudança está em `parceiro_nivel_historico`.
 */
export const parceiroNivelEstados = pgTable(
  'parceiro_nivel_estados',
  {
    parceiroId: uuid('parceiro_id')
      .primaryKey()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    nivelCodigo: varchar('nivel_codigo', { length: 20 })
      .notNull()
      .references(() => parceiroNiveis.codigo),
    nivelDesde: timestamp('nivel_desde').notNull(),
    /** Até quando o nível não cai. Concedido na subida, congelado. */
    protegidoAte: timestamp('protegido_ate'),
    clientesAtivos: integer('clientes_ativos').notNull().default(0),
    configuracaoVersao: integer('configuracao_versao').notNull(),
    calculadoEm: timestamp('calculado_em').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    clientesValidos: check(
      'parceiro_nivel_estados_clientes_validos',
      sql`${t.clientesAtivos} >= 0`,
    ),
  }),
)
