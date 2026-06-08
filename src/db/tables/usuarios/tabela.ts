import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core'
import { empresas } from '../empresas/tabela'
import { usuarioStatusEnum } from '../../enums'

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').references(() => empresas.id),
  nome: varchar('nome', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  whatsapp: varchar('whatsapp', { length: 20 }),
  senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
  emailVerificado: boolean('email_verificado').default(false).notNull(),
  emailVerificadoEm: timestamp('email_verificado_em'),
  ultimoLoginEm: timestamp('ultimo_login_em'),
  status: usuarioStatusEnum('status').notNull().default('pendente_email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
