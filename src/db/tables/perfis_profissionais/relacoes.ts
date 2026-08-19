import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { perfisProfissionais } from './tabela'

export const perfisProfissionaisRelations = relations(perfisProfissionais, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [perfisProfissionais.usuarioId],
    references: [usuarios.id],
  }),
}))

