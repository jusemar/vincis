import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { perfilCasosSucesso } from './tabela'

export const perfilCasosSucessoRelations = relations(perfilCasosSucesso, ({ one }) => ({
  prestador: one(usuarios, {
    fields: [perfilCasosSucesso.prestadorId],
    references: [usuarios.id],
  }),
}))
