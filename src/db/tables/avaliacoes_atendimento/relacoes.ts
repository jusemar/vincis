import { relations } from 'drizzle-orm'
import { avaliacoesAtendimento } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const avaliacoesAtendimentoRelations = relations(
  avaliacoesAtendimento,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [avaliacoesAtendimento.atendimentoId],
      references: [atendimentos.id],
    }),
    prestador: one(usuarios, {
      fields: [avaliacoesAtendimento.prestadorId],
      references: [usuarios.id],
      relationName: 'prestador_avaliado',
    }),
    cliente: one(usuarios, {
      fields: [avaliacoesAtendimento.clienteUsuarioId],
      references: [usuarios.id],
      relationName: 'cliente_avaliador',
    }),
  }),
)
