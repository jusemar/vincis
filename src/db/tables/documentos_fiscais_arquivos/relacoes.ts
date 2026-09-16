import { relations } from 'drizzle-orm'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { documentosFiscaisEventos } from '../documentos_fiscais_eventos/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'
import { documentosFiscaisArquivos } from './tabela'

export const documentosFiscaisArquivosRelations = relations(
  documentosFiscaisArquivos,
  ({ one }) => ({
    empresa: one(empresas, {
      fields: [documentosFiscaisArquivos.empresaId],
      references: [empresas.id],
    }),
    documento: one(documentosFiscais, {
      fields: [documentosFiscaisArquivos.documentoFiscalId],
      references: [documentosFiscais.id],
    }),
    evento: one(documentosFiscaisEventos, {
      fields: [documentosFiscaisArquivos.eventoFiscalId],
      references: [documentosFiscaisEventos.id],
    }),
    enviadoPor: one(usuarios, {
      fields: [documentosFiscaisArquivos.enviadoPorId],
      references: [usuarios.id],
    }),
  }),
)
