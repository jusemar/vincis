import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { cmsCardsHome } from '../cms_cards_home/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Artigo da Central exibido no lugar do conteúdo de um card da Home.
 *
 * Só um vínculo: o conteúdo original do card continua intacto em
 * `cms_cards_home` (nada é copiado). `artigo_id` nulo = card original.
 * Na leitura pública, artigo que deixou de estar publicado é ignorado e o card
 * volta sozinho ao original — sem ninguém precisar desfazer o destaque.
 */
export const conhecimentoDestaquesHome = pgTable(
  'conhecimento_destaques_home',
  {
    cardId: uuid('card_id')
      .primaryKey()
      .references(() => cmsCardsHome.id, { onDelete: 'cascade' }),
    artigoId: uuid('artigo_id').references(() => conhecimentoArtigos.id, { onDelete: 'set null' }),
    definidoPorId: uuid('definido_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // O mesmo artigo não ocupa dois cards.
    artigoUnico: uniqueIndex('conhecimento_destaques_home_artigo_unique').on(t.artigoId),
  }),
)
