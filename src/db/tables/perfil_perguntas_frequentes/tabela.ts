import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Uma pergunta do "FAQ personalizado" do perfil público.
 *
 * Mesma regra de posse e ordenação das demais listas de vitrine: dono é
 * `prestador_id`, `ordem` é gravada por quem substitui a lista inteira em
 * `salvarPerguntasFrequentes`.
 */
export const perfilPerguntasFrequentes = pgTable(
  'perfil_perguntas_frequentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    pergunta: varchar('pergunta', { length: 300 }).notNull(),
    resposta: text('resposta').notNull(),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    prestadorIdx: index('perfil_perguntas_frequentes_prestador_idx').on(t.prestadorId, t.ordem),
  }),
)
