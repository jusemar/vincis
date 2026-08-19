import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const clienteAtribuicoes = pgTable('cliente_atribuicoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  clienteId: uuid('cliente_id').notNull().references(() => clientes.id),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
  profissionalId: uuid('profissional_id').notNull().references(() => usuarios.id),
  atribuidoPorId: uuid('atribuido_por_id').notNull().references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  clienteProfissionalUnique: uniqueIndex('cliente_atribuicoes_cliente_profissional_unique').on(t.clienteId, t.profissionalId),
  profissionalIdx: index('cliente_atribuicoes_profissional_idx').on(t.profissionalId),
  empresaIdx: index('cliente_atribuicoes_empresa_idx').on(t.empresaId),
}))
