import { relations } from 'drizzle-orm'
import { conhecimentoArtigoVersoes } from '../conhecimento_artigo_versoes/tabela'
import { conhecimentoCategorias } from './tabela'

export const conhecimentoCategoriasRelations = relations(conhecimentoCategorias, ({ many }) => ({
  versoes: many(conhecimentoArtigoVersoes),
}))
