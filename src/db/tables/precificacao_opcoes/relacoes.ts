import { relations } from 'drizzle-orm'
import { precificacaoOpcoes } from './tabela'
import { precificacaoDimensoes } from '../precificacao_dimensoes/tabela'

export const precificacaoOpcoesRelations = relations(
  precificacaoOpcoes,
  ({ one }) => ({
    dimensao: one(precificacaoDimensoes, {
      fields: [precificacaoOpcoes.dimensaoCodigo],
      references: [precificacaoDimensoes.codigo],
    }),
  }),
)
