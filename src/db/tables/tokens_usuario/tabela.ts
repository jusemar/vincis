import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

export const tokensUsuario = pgTable('tokens_usuario', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tipo: varchar('tipo', { length: 50 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiraEm: timestamp('expira_em').notNull(),
  usadoEm: timestamp('usado_em'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
