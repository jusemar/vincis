import { relations } from 'drizzle-orm'
import { parceiros } from '../parceiros/tabela'
import { parceiroIndicacoes } from './tabela'

export const parceiroIndicacoesRelations = relations(
  parceiroIndicacoes,
  ({ one }) => ({
    parceiro: one(parceiros, {
      fields: [parceiroIndicacoes.parceiroId],
      references: [parceiros.id],
    }),
  }),
)
