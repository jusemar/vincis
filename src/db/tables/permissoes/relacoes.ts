import { relations } from 'drizzle-orm'
import { permissoes } from './tabela'
import { perfisPermissoes } from '../perfis_permissoes/tabela'

export const permissoesRelations = relations(permissoes, ({ many }) => ({
  perfisPermissoes: many(perfisPermissoes),
}))
