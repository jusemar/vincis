import { relations } from 'drizzle-orm'
import { cmsCardsHome } from '../cms_cards_home/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoDestaquesHome } from './tabela'

export const conhecimentoDestaquesHomeRelations = relations(conhecimentoDestaquesHome, ({ one }) => ({
  card: one(cmsCardsHome, { fields: [conhecimentoDestaquesHome.cardId], references: [cmsCardsHome.id] }),
  artigo: one(conhecimentoArtigos, { fields: [conhecimentoDestaquesHome.artigoId], references: [conhecimentoArtigos.id] }),
  definidoPor: one(usuarios, { fields: [conhecimentoDestaquesHome.definidoPorId], references: [usuarios.id] }),
}))
