import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { assinaturaCompetencias } from '../assinatura_competencias/tabela'
import { assinaturaPagamentos } from '../assinatura_pagamentos/tabela'
import { assinaturas } from '../assinaturas/tabela'

/**
 * Quanto de um pagamento cobre qual mês.
 *
 * ## Um pagamento, vários meses
 *
 * O mensal paga um mês; o semestral, seis de uma vez; o anual, doze. Uma coluna
 * `pagamento_id` na competência não representaria complemento, ajuste ou
 * estorno parcial — esta tabela representa: cada linha é uma fatia do
 * pagamento apropriada a um mês, com o valor congelado do mês.
 *
 * ## Coberto não é prestado
 *
 * Um mês com alocação de pagamento confirmado está **financeiramente coberto**.
 * Isso não o torna cumprido, não o torna em prestação e não libera comissão:
 * seis meses pagos hoje continuam sendo seis meses a prestar.
 *
 * ## A regra da comissão futura
 *
 * Uma competência só sustentará comissão de parceiro quando, ao mesmo tempo:
 * houver pagamento confirmado cobrindo-a (esta tabela), ela estiver cumprida,
 * a assinatura for elegível ao programa, existir atribuição válida e a
 * comissão daquela competência ainda não existir. A comissão apontará para a
 * competência, não para a assinatura.
 *
 * ## Isolamento no banco
 *
 * `assinatura_id` está aqui só para as duas chaves estrangeiras compostas: o
 * pagamento e a competência precisam ser da **mesma** assinatura, e é o banco
 * quem recusa o contrário.
 */
export const assinaturaPagamentoAlocacoes = pgTable(
  'assinatura_pagamento_alocacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pagamentoId: uuid('pagamento_id').notNull(),
    competenciaId: uuid('competencia_id').notNull(),
    assinaturaId: uuid('assinatura_id')
      .notNull()
      .references(() => assinaturas.id),
    valorCentavos: integer('valor_centavos').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    doPagamento: foreignKey({
      name: 'assinatura_pagamento_alocacoes_pagamento_fk',
      columns: [t.pagamentoId, t.assinaturaId],
      foreignColumns: [assinaturaPagamentos.id, assinaturaPagamentos.assinaturaId],
    }),
    daCompetencia: foreignKey({
      name: 'assinatura_pagamento_alocacoes_competencia_fk',
      columns: [t.competenciaId, t.assinaturaId],
      foreignColumns: [
        assinaturaCompetencias.id,
        assinaturaCompetencias.assinaturaId,
      ],
    }),
    // Reprocessar não aloca o mesmo pagamento ao mesmo mês duas vezes.
    porPagamentoECompetenciaUnica: uniqueIndex(
      'assinatura_pagamento_alocacoes_unica',
    ).on(t.pagamentoId, t.competenciaId),
    daCompetenciaIdx: index('assinatura_pagamento_alocacoes_competencia_idx').on(
      t.competenciaId,
    ),
    valorPositivo: check(
      'assinatura_pagamento_alocacoes_valor_positivo',
      sql`${t.valorCentavos} > 0`,
    ),
  }),
)
