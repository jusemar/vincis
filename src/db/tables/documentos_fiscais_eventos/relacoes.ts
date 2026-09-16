import { relations } from 'drizzle-orm'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { documentosFiscaisArquivos } from '../documentos_fiscais_arquivos/tabela'
import { usuarios } from '../usuarios/tabela'
import { documentosFiscaisEventos } from './tabela'

export const documentosFiscaisEventosRelations = relations(
  documentosFiscaisEventos,
  ({ one, many }) => ({
    documento: one(documentosFiscais, {
      fields: [documentosFiscaisEventos.documentoFiscalId],
      references: [documentosFiscais.id],
    }),
    registradoPor: one(usuarios, {
      fields: [documentosFiscaisEventos.registradoPorId],
      references: [usuarios.id],
    }),
    arquivos: many(documentosFiscaisArquivos),
  }),
)
