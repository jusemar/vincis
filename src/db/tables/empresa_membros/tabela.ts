import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { empresaMembroStatusEnum } from '../../enums'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const empresaMembros = pgTable('empresa_membros', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  funcao: varchar('funcao', { length: 20 }),
  status: empresaMembroStatusEnum('status').notNull().default('ativo'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  empresaUsuarioUnique: uniqueIndex('empresa_membros_empresa_usuario_unique').on(
    t.empresaId,
    t.usuarioId,
  ),
  empresaStatusIdx: index('empresa_membros_empresa_status_idx').on(t.empresaId, t.status),
  usuarioStatusIdx: index('empresa_membros_usuario_status_idx').on(t.usuarioId, t.status),
}))
