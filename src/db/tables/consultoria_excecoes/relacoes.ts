import { relations } from 'drizzle-orm'
import { consultoriaExcecoes } from './tabela'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'

export const consultoriaExcecoesRelations = relations(
  consultoriaExcecoes,
  ({ one }) => ({
    configuracao: one(consultoriaConfiguracoes, {
      fields: [consultoriaExcecoes.configuracaoId],
      references: [consultoriaConfiguracoes.id],
    }),
  }),
)
