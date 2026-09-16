import { relations } from 'drizzle-orm'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'
import { documentosFiscaisPartes } from './tabela'

export const documentosFiscaisPartesRelations = relations(documentosFiscaisPartes, ({ one }) => ({
  extracao: one(documentosFiscaisExtracoes, {
    fields: [documentosFiscaisPartes.extracaoId],
    references: [documentosFiscaisExtracoes.id],
  }),
}))
