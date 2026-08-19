import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core'
import { perfis } from '../perfis/tabela'
import { permissoes } from '../permissoes/tabela'

export const perfisPermissoes = pgTable('perfis_permissoes', {
  perfilId: uuid('perfil_id').notNull().references(() => perfis.id),
  permissaoId: uuid('permissao_id').notNull().references(() => permissoes.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.perfilId, t.permissaoId] }),
}))
