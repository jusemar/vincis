import { relations } from 'drizzle-orm'
import { oportunidadePropostas } from './tabela'
import { oportunidadeContrapropostas } from '../oportunidade_contrapropostas/tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadePropostasRelations = relations(
  oportunidadePropostas,
  ({ one, many }) => ({
    contrapropostas: many(oportunidadeContrapropostas),
    oportunidade: one(oportunidades, {
      fields: [oportunidadePropostas.oportunidadeId],
      references: [oportunidades.id],
    }),
    prestador: one(usuarios, {
      fields: [oportunidadePropostas.prestadorId],
      references: [usuarios.id],
    }),
  }),
)
