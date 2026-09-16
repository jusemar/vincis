import { relations } from 'drizzle-orm'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'
import { documentosFiscaisTributos } from '../documentos_fiscais_tributos/tabela'
import { documentosFiscaisItens } from './tabela'

export const documentosFiscaisItensRelations = relations(documentosFiscaisItens, ({ one, many }) => ({
  extracao: one(documentosFiscaisExtracoes, {
    fields: [documentosFiscaisItens.extracaoId],
    references: [documentosFiscaisExtracoes.id],
  }),
  tributos: many(documentosFiscaisTributos),
}))
