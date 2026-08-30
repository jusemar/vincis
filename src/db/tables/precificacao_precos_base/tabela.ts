import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * O ponto de partida do preço: quanto custa a rotina de cada regime tributário.
 *
 * A grade é (grupo × regime), não (serviço × regime), porque é assim que o
 * negócio pensa: existe um preço da rotina contábil e um preço da rotina
 * jurídica, e os serviços derivam deles (`precificacao_servicos`). Quatro
 * regimes vezes dois grupos são oito linhas que o Gestor consegue reajustar de
 * uma vez sem se perguntar se esqueceu alguma combinação.
 *
 * O par é único no banco — não na tela. Duas linhas para `contabil/simples`
 * dariam ao motor duas respostas para a mesma pergunta, e ele escolheria uma
 * pela ordem de leitura.
 */
export const precificacaoPrecosBase = pgTable(
  'precificacao_precos_base',
  {
    /** `contabil` ou `juridico`. Mesmo vocabulário de `precificacao_servicos`. */
    grupo: varchar('grupo', { length: 20 }).notNull(),
    /** `mei`, `simples`, `presumido`, `real` — códigos da dimensão `regime`. */
    regime: varchar('regime', { length: 30 }).notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    grupoRegimeUnico: uniqueIndex('precificacao_precos_base_grupo_regime').on(
      t.grupo,
      t.regime,
    ),
    grupoConhecido: check(
      'precificacao_precos_base_grupo_conhecido',
      sql`${t.grupo} in ('contabil', 'juridico')`,
    ),
    // Zero é um preço válido (uma promoção, um regime cortesia); negativo não é
    // preço nenhum, e chegaria ao cliente como desconto invisível.
    valorNaoNegativo: check(
      'precificacao_precos_base_valor_nao_negativo',
      sql`${t.valorCentavos} >= 0`,
    ),
  }),
)
