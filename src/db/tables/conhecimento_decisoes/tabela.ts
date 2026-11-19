import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { conhecimentoArtigoVersoes } from '../conhecimento_artigo_versoes/tabela'

/**
 * Histórico editorial de um artigo: quem enviou, aprovou, devolveu, rejeitou,
 * despublicou, arquivou ou destacou — e com qual observação.
 *
 * É a linha do tempo que o autor e a Gestão leem na tela. A trilha de auditoria
 * da plataforma (`eventos_auditoria`, com IP) é gravada em paralelo pelas
 * mesmas actions; esta tabela existe para ser exibida, aquela para ser
 * conferida.
 */
export const conhecimentoDecisoes = pgTable(
  'conhecimento_decisoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artigoId: uuid('artigo_id')
      .notNull()
      .references(() => conhecimentoArtigos.id, { onDelete: 'restrict' }),
    versaoId: uuid('versao_id').references(() => conhecimentoArtigoVersoes.id, {
      onDelete: 'set null',
    }),
    acao: varchar('acao', { length: 40 }).notNull(),
    executorId: uuid('executor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    observacao: text('observacao'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    artigoIdx: index('conhecimento_decisoes_artigo_idx').on(t.artigoId, t.createdAt),
  }),
)
