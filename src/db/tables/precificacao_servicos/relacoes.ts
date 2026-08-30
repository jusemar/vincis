import { relations } from 'drizzle-orm'
import { precificacaoServicos } from './tabela'
import { precificacaoDescontos } from '../precificacao_descontos/tabela'

export const precificacaoServicosRelations = relations(
  precificacaoServicos,
  ({ many }) => ({
    descontos: many(precificacaoDescontos),
  }),
)
