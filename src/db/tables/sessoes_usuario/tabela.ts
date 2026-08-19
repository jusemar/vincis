import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

export const sessoesUsuario = pgTable('sessoes_usuario', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  ip: varchar('ip', { length: 45 }),
  userAgent: text('user_agent'),
  expiraEm: timestamp('expira_em').notNull(),
  encerradaEm: timestamp('encerrada_em'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
