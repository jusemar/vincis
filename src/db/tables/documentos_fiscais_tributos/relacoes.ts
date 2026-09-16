import { relations } from 'drizzle-orm'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'
import { documentosFiscaisItens } from '../documentos_fiscais_itens/tabela'
import { documentosFiscaisTributos } from './tabela'

export const documentosFiscaisTributosRelations = relations(
  documentosFiscaisTributos,
  ({ one }) => ({
    extracao: one(documentosFiscaisExtracoes, {
      fields: [documentosFiscaisTributos.extracaoId],
      references: [documentosFiscaisExtracoes.id],
    }),
    item: one(documentosFiscaisItens, {
      fields: [documentosFiscaisTributos.itemId],
      references: [documentosFiscaisItens.id],
    }),
  }),
)
