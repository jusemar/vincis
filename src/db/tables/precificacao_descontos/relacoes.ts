import { relations } from 'drizzle-orm'
import { precificacaoDescontos } from './tabela'
import { precificacaoServicos } from '../precificacao_servicos/tabela'

export const precificacaoDescontosRelations = relations(
  precificacaoDescontos,
  ({ one }) => ({
    servico: one(precificacaoServicos, {
      fields: [precificacaoDescontos.servicoCodigo],
      references: [precificacaoServicos.codigo],
    }),
  }),
)
