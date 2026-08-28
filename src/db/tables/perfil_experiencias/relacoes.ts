import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { perfilExperiencias } from './tabela'

export const perfilExperienciasRelations = relations(perfilExperiencias, ({ one }) => ({
  prestador: one(usuarios, {
    fields: [perfilExperiencias.prestadorId],
    references: [usuarios.id],
  }),
}))
