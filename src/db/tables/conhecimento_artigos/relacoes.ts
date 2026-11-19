import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigoVersoes } from '../conhecimento_artigo_versoes/tabela'
import { conhecimentoDecisoes } from '../conhecimento_decisoes/tabela'
import { conhecimentoArtigos } from './tabela'

export const conhecimentoArtigosRelations = relations(conhecimentoArtigos, ({ one, many }) => ({
  autor: one(usuarios, {
    fields: [conhecimentoArtigos.autorId],
    references: [usuarios.id],
    relationName: 'conhecimento_artigo_autor',
  }),
  responsavelEditorial: one(usuarios, {
    fields: [conhecimentoArtigos.responsavelEditorialId],
    references: [usuarios.id],
    relationName: 'conhecimento_artigo_responsavel',
  }),
  versaoPublicada: one(conhecimentoArtigoVersoes, {
    fields: [conhecimentoArtigos.versaoPublicadaId],
    references: [conhecimentoArtigoVersoes.id],
    relationName: 'conhecimento_artigo_versao_publicada',
  }),
  versoes: many(conhecimentoArtigoVersoes, { relationName: 'conhecimento_artigo_versoes' }),
  decisoes: many(conhecimentoDecisoes),
}))
