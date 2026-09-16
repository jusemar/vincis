import { relations } from 'drizzle-orm'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { documentosFiscaisArquivos } from '../documentos_fiscais_arquivos/tabela'
import { documentosFiscaisItens } from '../documentos_fiscais_itens/tabela'
import { documentosFiscaisPartes } from '../documentos_fiscais_partes/tabela'
import { documentosFiscaisTributos } from '../documentos_fiscais_tributos/tabela'
import { usuarios } from '../usuarios/tabela'
import { documentosFiscaisExtracoes } from './tabela'

export const documentosFiscaisExtracoesRelations = relations(
  documentosFiscaisExtracoes,
  ({ one, many }) => ({
    documento: one(documentosFiscais, {
      fields: [documentosFiscaisExtracoes.documentoFiscalId],
      references: [documentosFiscais.id],
    }),
    arquivo: one(documentosFiscaisArquivos, {
      fields: [documentosFiscaisExtracoes.arquivoId],
      references: [documentosFiscaisArquivos.id],
    }),
    criadaPor: one(usuarios, {
      fields: [documentosFiscaisExtracoes.criadaPorId],
      references: [usuarios.id],
    }),
    partes: many(documentosFiscaisPartes),
    itens: many(documentosFiscaisItens),
    tributos: many(documentosFiscaisTributos),
  }),
)
