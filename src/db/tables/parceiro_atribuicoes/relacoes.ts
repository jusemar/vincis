import { relations } from 'drizzle-orm'
import { oportunidades } from '../oportunidades/tabela'
import { parceiroIndicacoes } from '../parceiro_indicacoes/tabela'
import { parceiros } from '../parceiros/tabela'
import { parceiroAtribuicoes } from './tabela'

export const parceiroAtribuicoesRelations = relations(
  parceiroAtribuicoes,
  ({ one }) => ({
    indicacao: one(parceiroIndicacoes, {
      fields: [parceiroAtribuicoes.indicacaoId],
      references: [parceiroIndicacoes.id],
    }),
    parceiro: one(parceiros, {
      fields: [parceiroAtribuicoes.parceiroId],
      references: [parceiros.id],
    }),
    oportunidade: one(oportunidades, {
      fields: [parceiroAtribuicoes.oportunidadeId],
      references: [oportunidades.id],
    }),
  }),
)
