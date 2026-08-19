import { relations } from 'drizzle-orm'
import { atendimentoChecklistItens } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoChecklistItensRelations = relations(
  atendimentoChecklistItens,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoChecklistItens.atendimentoId],
      references: [atendimentos.id],
    }),
    responsavelConclusao: one(usuarios, {
      fields: [atendimentoChecklistItens.concluidoPor],
      references: [usuarios.id],
    }),
  }),
)
