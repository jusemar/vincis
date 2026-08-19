import { relations } from 'drizzle-orm'
import { atendimentoArquivos } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoArquivosRelations = relations(
  atendimentoArquivos,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoArquivos.atendimentoId],
      references: [atendimentos.id],
    }),
    remetente: one(usuarios, {
      fields: [atendimentoArquivos.remetenteId],
      references: [usuarios.id],
    }),
  }),
)
