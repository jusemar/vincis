import { relations } from 'drizzle-orm'
import { atendimentoEncerramentos } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoEncerramentosRelations = relations(
  atendimentoEncerramentos,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoEncerramentos.atendimentoId],
      references: [atendimentos.id],
    }),
    gestor: one(usuarios, {
      fields: [atendimentoEncerramentos.gestorId],
      references: [usuarios.id],
    }),
  }),
)
