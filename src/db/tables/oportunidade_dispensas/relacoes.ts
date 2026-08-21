import { relations } from 'drizzle-orm'
import { oportunidadeDispensas } from './tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadeDispensasRelations = relations(
  oportunidadeDispensas,
  ({ one }) => ({
    oportunidade: one(oportunidades, {
      fields: [oportunidadeDispensas.oportunidadeId],
      references: [oportunidades.id],
    }),
    prestador: one(usuarios, {
      fields: [oportunidadeDispensas.prestadorId],
      references: [usuarios.id],
    }),
  }),
)
