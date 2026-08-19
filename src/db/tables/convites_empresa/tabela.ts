import { sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const convitesEmpresa = pgTable(
  'convites_empresa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
    remetenteId: uuid('remetente_id').notNull().references(() => usuarios.id),
    destinatarioId: uuid('destinatario_id').notNull().references(() => usuarios.id),
    funcao: varchar('funcao', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    expiraEm: timestamp('expira_em').notNull(),
    respondidoEm: timestamp('respondido_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    pendenteUnique: uniqueIndex('convites_empresa_pendente_unique')
      .on(t.empresaId, t.destinatarioId)
      .where(sql`${t.status} = 'pendente'`),
    destinatarioStatusIdx: index('convites_empresa_destinatario_status_idx').on(
      t.destinatarioId,
      t.status,
    ),
    empresaStatusIdx: index('convites_empresa_empresa_status_idx').on(
      t.empresaId,
      t.status,
    ),
  }),
)
