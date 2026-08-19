import { relations } from 'drizzle-orm'
import { atendimentoLeituras } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoLeiturasRelations = relations(
  atendimentoLeituras,
  ({ one }) => ({
    usuario: one(usuarios, {
      fields: [atendimentoLeituras.usuarioId],
      references: [usuarios.id],
    }),
  }),
)
