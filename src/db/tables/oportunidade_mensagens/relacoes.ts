import { relations } from 'drizzle-orm'
import { oportunidadeMensagens } from './tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadeMensagensRelations = relations(
  oportunidadeMensagens,
  ({ one }) => ({
    oportunidade: one(oportunidades, {
      fields: [oportunidadeMensagens.oportunidadeId],
      references: [oportunidades.id],
    }),
    autor: one(usuarios, {
      fields: [oportunidadeMensagens.autorId],
      references: [usuarios.id],
    }),
  }),
)
