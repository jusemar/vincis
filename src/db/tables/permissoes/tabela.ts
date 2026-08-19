import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'

export const permissoes = pgTable('permissoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 100 }).notNull().unique(),
  descricao: text('descricao'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
