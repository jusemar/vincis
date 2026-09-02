import { relations } from 'drizzle-orm'
import { precificacaoProfissional } from '../precificacao_profissional/tabela'
import { precificacaoProfissionalValores } from './tabela'

export const precificacaoProfissionalValoresRelations = relations(
  precificacaoProfissionalValores,
  ({ one }) => ({
    tabela: one(precificacaoProfissional, {
      fields: [precificacaoProfissionalValores.profissionalId],
      references: [precificacaoProfissional.profissionalId],
    }),
  }),
)
