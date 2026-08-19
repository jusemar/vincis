import { relations } from 'drizzle-orm'
import { atendimentoParticipantes } from './tabela'
import { atendimentoConvites } from '../atendimento_convites/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoParticipantesRelations = relations(
  atendimentoParticipantes,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoParticipantes.atendimentoId],
      references: [atendimentos.id],
    }),
    usuario: one(usuarios, {
      fields: [atendimentoParticipantes.usuarioId],
      references: [usuarios.id],
    }),
    convite: one(atendimentoConvites, {
      fields: [atendimentoParticipantes.conviteId],
      references: [atendimentoConvites.id],
    }),
  }),
)
