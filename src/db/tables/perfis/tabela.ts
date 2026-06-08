import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'

export const perfis = pgTable('perfis', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 50 }).notNull().unique(),
  descricao: text('descricao'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
