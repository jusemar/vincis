import { relations } from 'drizzle-orm'
import { oportunidadeContrapropostas } from './tabela'
import { oportunidadePropostas } from '../oportunidade_propostas/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadeContrapropostasRelations = relations(
  oportunidadeContrapropostas,
  ({ one }) => ({
    proposta: one(oportunidadePropostas, {
      fields: [oportunidadeContrapropostas.propostaId],
      references: [oportunidadePropostas.id],
    }),
    autor: one(usuarios, {
      fields: [oportunidadeContrapropostas.autorId],
      references: [usuarios.id],
    }),
  }),
)
