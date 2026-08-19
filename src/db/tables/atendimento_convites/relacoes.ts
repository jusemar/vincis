import { relations } from 'drizzle-orm'
import { atendimentoConvites } from './tabela'
import { atendimentoConviteMensagens } from '../atendimento_convite_mensagens/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoConvitesRelations = relations(
  atendimentoConvites,
  ({ one, many }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoConvites.atendimentoId],
      references: [atendimentos.id],
    }),
    remetente: one(usuarios, {
      fields: [atendimentoConvites.remetenteId],
      references: [usuarios.id],
    }),
    destinatario: one(usuarios, {
      fields: [atendimentoConvites.destinatarioId],
      references: [usuarios.id],
    }),
    mensagens: many(atendimentoConviteMensagens),
  }),
)
