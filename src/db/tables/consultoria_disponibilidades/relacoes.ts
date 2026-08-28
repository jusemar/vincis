import { relations } from 'drizzle-orm'
import { consultoriaDisponibilidades } from './tabela'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'

export const consultoriaDisponibilidadesRelations = relations(
  consultoriaDisponibilidades,
  ({ one }) => ({
    configuracao: one(consultoriaConfiguracoes, {
      fields: [consultoriaDisponibilidades.configuracaoId],
      references: [consultoriaConfiguracoes.id],
    }),
  }),
)
