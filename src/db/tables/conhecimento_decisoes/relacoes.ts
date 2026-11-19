import { relations } from 'drizzle-orm'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { conhecimentoArtigoVersoes } from '../conhecimento_artigo_versoes/tabela'
import { conhecimentoDecisoes } from './tabela'

export const conhecimentoDecisoesRelations = relations(conhecimentoDecisoes, ({ one }) => ({
  artigo: one(conhecimentoArtigos, {
    fields: [conhecimentoDecisoes.artigoId],
    references: [conhecimentoArtigos.id],
  }),
  versao: one(conhecimentoArtigoVersoes, {
    fields: [conhecimentoDecisoes.versaoId],
    references: [conhecimentoArtigoVersoes.id],
  }),
  executor: one(usuarios, {
    fields: [conhecimentoDecisoes.executorId],
    references: [usuarios.id],
  }),
}))
