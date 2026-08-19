import { relations } from 'drizzle-orm'
import { atendimentoMensagens } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoMensagensRelations = relations(
  atendimentoMensagens,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoMensagens.atendimentoId],
      references: [atendimentos.id],
    }),
    autor: one(usuarios, {
      fields: [atendimentoMensagens.autorId],
      references: [usuarios.id],
    }),
  }),
)
