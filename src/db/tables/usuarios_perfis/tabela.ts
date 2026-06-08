import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'
import { perfis } from '../perfis/tabela'

export const usuariosPerfis = pgTable('usuarios_perfis', {
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  perfilId: uuid('perfil_id').notNull().references(() => perfis.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.usuarioId, t.perfilId] }),
}))
