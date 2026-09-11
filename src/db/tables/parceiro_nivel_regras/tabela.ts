import { sql } from 'drizzle-orm'
import { check, integer, pgTable, primaryKey, uuid, varchar } from 'drizzle-orm/pg-core'
import { parceiroNivelConfiguracoes } from '../parceiro_nivel_configuracoes/tabela'
import { parceiroNiveis } from '../parceiro_niveis/tabela'

/**
 * A regra de um nível numa versão da configuração.
 *
 * `percentual_centesimos` é o percentual em centésimos de ponto — 500 é 5%,
 * 750 é 7,5% —, inteiro, para que a comissão nunca passe por ponto flutuante.
 * `minimo_clientes` é o mínimo de clientes recorrentes ativos; a base exige
 * zero. A ordem crescente dos mínimos entre níveis é validada na publicação,
 * na mesma transação que grava a versão.
 */
export const parceiroNivelRegras = pgTable(
  'parceiro_nivel_regras',
  {
    configuracaoId: uuid('configuracao_id')
      .notNull()
      .references(() => parceiroNivelConfiguracoes.id),
    nivelCodigo: varchar('nivel_codigo', { length: 20 })
      .notNull()
      .references(() => parceiroNiveis.codigo),
    minimoClientes: integer('minimo_clientes').notNull(),
    percentualCentesimos: integer('percentual_centesimos').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.configuracaoId, t.nivelCodigo] }),
    minimoValido: check('parceiro_nivel_regras_minimo_valido', sql`${t.minimoClientes} >= 0`),
    percentualValido: check(
      'parceiro_nivel_regras_percentual_valido',
      sql`${t.percentualCentesimos} >= 0 and ${t.percentualCentesimos} <= 10000`,
    ),
  }),
)
