import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { conhecimentoCategorias } from '../conhecimento_categorias/tabela'
import { conhecimentoArtigoVersoes } from './tabela'

export const conhecimentoArtigoVersoesRelations = relations(conhecimentoArtigoVersoes, ({ one }) => ({
  artigo: one(conhecimentoArtigos, {
    fields: [conhecimentoArtigoVersoes.artigoId],
    references: [conhecimentoArtigos.id],
    relationName: 'conhecimento_artigo_versoes',
  }),
  categoria: one(conhecimentoCategorias, {
    fields: [conhecimentoArtigoVersoes.categoriaId],
    references: [conhecimentoCategorias.id],
  }),
  criadaPor: one(usuarios, {
    fields: [conhecimentoArtigoVersoes.criadaPorId],
    references: [usuarios.id],
    relationName: 'conhecimento_versao_criada_por',
  }),
  decididaPor: one(usuarios, {
    fields: [conhecimentoArtigoVersoes.decididaPorId],
    references: [usuarios.id],
    relationName: 'conhecimento_versao_decidida_por',
  }),
}))
