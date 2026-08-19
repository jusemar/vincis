import { relations } from 'drizzle-orm'
import { atendimentoConviteMensagens } from './tabela'
import { atendimentoConvites } from '../atendimento_convites/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoConviteMensagensRelations = relations(
  atendimentoConviteMensagens,
  ({ one }) => ({
    convite: one(atendimentoConvites, {
      fields: [atendimentoConviteMensagens.conviteId],
      references: [atendimentoConvites.id],
    }),
    autor: one(usuarios, {
      fields: [atendimentoConviteMensagens.autorId],
      references: [usuarios.id],
    }),
  }),
)
