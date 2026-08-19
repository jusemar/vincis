import { relations } from 'drizzle-orm'
import { comunicados } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const comunicadosRelations = relations(comunicados, ({ one }) => ({
  autor: one(usuarios, {
    fields: [comunicados.autorId],
    references: [usuarios.id],
  }),
}))
