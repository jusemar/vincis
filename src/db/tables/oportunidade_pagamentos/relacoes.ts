import { relations } from 'drizzle-orm'
import { oportunidadePagamentos } from './tabela'
import { oportunidadePropostas } from '../oportunidade_propostas/tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadePagamentosRelations = relations(
  oportunidadePagamentos,
  ({ one }) => ({
    oportunidade: one(oportunidades, {
      fields: [oportunidadePagamentos.oportunidadeId],
      references: [oportunidades.id],
    }),
    proposta: one(oportunidadePropostas, {
      fields: [oportunidadePagamentos.propostaId],
      references: [oportunidadePropostas.id],
    }),
    cliente: one(usuarios, {
      fields: [oportunidadePagamentos.clienteUsuarioId],
      references: [usuarios.id],
      relationName: 'cliente_pagamento_oportunidade',
    }),
    prestador: one(usuarios, {
      fields: [oportunidadePagamentos.prestadorId],
      references: [usuarios.id],
      relationName: 'prestador_pagamento_oportunidade',
    }),
  }),
)
