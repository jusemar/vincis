import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { perfilPerguntasFrequentes } from './tabela'

export const perfilPerguntasFrequentesRelations = relations(perfilPerguntasFrequentes, ({ one }) => ({
  prestador: one(usuarios, {
    fields: [perfilPerguntasFrequentes.prestadorId],
    references: [usuarios.id],
  }),
}))
