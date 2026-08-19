import { relations } from 'drizzle-orm'
import { atendimentoEventos } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoEventosRelations = relations(
  atendimentoEventos,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoEventos.atendimentoId],
      references: [atendimentos.id],
    }),
    autor: one(usuarios, {
      fields: [atendimentoEventos.autorId],
      references: [usuarios.id],
    }),
  }),
)
