import { relations } from 'drizzle-orm'
import { notificacoes } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const notificacoesRelations = relations(notificacoes, ({ one }) => ({
  destinatario: one(usuarios, {
    fields: [notificacoes.destinatarioId],
    references: [usuarios.id],
  }),
  atendimento: one(atendimentos, {
    fields: [notificacoes.atendimentoId],
    references: [atendimentos.id],
  }),
}))
