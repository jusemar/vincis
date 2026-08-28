import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Um item de "Histórico profissional" do perfil público.
 *
 * Mesma regra de posse e ordenação de `perfil_casos_sucesso`: dono é
 * `prestador_id`, `ordem` é gravada por quem substitui a lista inteira em
 * `salvarExperiencias`. `periodo` é o texto livre que hoje aparece como marco
 * ("12 anos", "2019-2023") — mantido como texto porque o desenho atual não
 * distingue ano de duração.
 */
export const perfilExperiencias = pgTable(
  'perfil_experiencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    periodo: varchar('periodo', { length: 60 }).notNull(),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descricao: text('descricao').notNull(),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    prestadorIdx: index('perfil_experiencias_prestador_idx').on(t.prestadorId, t.ordem),
  }),
)
