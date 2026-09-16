import { relations } from 'drizzle-orm'
import { clientes } from '../clientes/tabela'
import { documentosFiscaisArquivos } from '../documentos_fiscais_arquivos/tabela'
import { documentosFiscaisEventos } from '../documentos_fiscais_eventos/tabela'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'
import { documentosFiscais } from './tabela'

export const documentosFiscaisRelations = relations(documentosFiscais, ({ one, many }) => ({
  empresa: one(empresas, {
    fields: [documentosFiscais.empresaId],
    references: [empresas.id],
  }),
  cliente: one(clientes, {
    fields: [documentosFiscais.clienteId],
    references: [clientes.id],
  }),
  enviadoPor: one(usuarios, {
    fields: [documentosFiscais.enviadoPorId],
    references: [usuarios.id],
    relationName: 'documento_fiscal_enviado_por',
  }),
  revisadoPor: one(usuarios, {
    fields: [documentosFiscais.revisadoPorId],
    references: [usuarios.id],
    relationName: 'documento_fiscal_revisado_por',
  }),
  excluidoPor: one(usuarios, {
    fields: [documentosFiscais.excluidoPorId],
    references: [usuarios.id],
    relationName: 'documento_fiscal_excluido_por',
  }),
  arquivos: many(documentosFiscaisArquivos),
  eventos: many(documentosFiscaisEventos),
  extracoes: many(documentosFiscaisExtracoes),
}))
