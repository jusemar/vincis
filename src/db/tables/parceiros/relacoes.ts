import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { parceiros } from './tabela'

export const parceirosRelations = relations(parceiros, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [parceiros.usuarioId],
    references: [usuarios.id],
  }),
}))
