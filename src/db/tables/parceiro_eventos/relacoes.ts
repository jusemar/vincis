import { relations } from 'drizzle-orm'
import { parceiroIndicacoes } from '../parceiro_indicacoes/tabela'
import { parceiroEventos } from './tabela'

export const parceiroEventosRelations = relations(parceiroEventos, ({ one }) => ({
  indicacao: one(parceiroIndicacoes, {
    fields: [parceiroEventos.indicacaoId],
    references: [parceiroIndicacoes.id],
  }),
}))
