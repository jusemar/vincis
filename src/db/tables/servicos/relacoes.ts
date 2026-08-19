import { relations } from 'drizzle-orm'
import { servicos } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const servicosRelations = relations(servicos, ({ one }) => ({
  prestador: one(usuarios, {
    fields: [servicos.prestadorId],
    references: [usuarios.id],
  }),
}))
