import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { precificacaoProfissional } from './tabela'
import { precificacaoProfissionalValores } from '../precificacao_profissional_valores/tabela'

export const precificacaoProfissionalRelations = relations(
  precificacaoProfissional,
  ({ one, many }) => ({
    profissional: one(usuarios, {
      fields: [precificacaoProfissional.profissionalId],
      references: [usuarios.id],
    }),
    valores: many(precificacaoProfissionalValores),
  }),
)
