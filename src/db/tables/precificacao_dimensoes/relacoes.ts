import { relations } from 'drizzle-orm'
import { precificacaoDimensoes } from './tabela'
import { precificacaoOpcoes } from '../precificacao_opcoes/tabela'

export const precificacaoDimensoesRelations = relations(
  precificacaoDimensoes,
  ({ many }) => ({
    opcoes: many(precificacaoOpcoes),
  }),
)
