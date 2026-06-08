import { relations } from 'drizzle-orm'
import { perfis } from './tabela'
import { usuariosPerfis } from '../usuarios_perfis/tabela'

export const perfisRelations = relations(perfis, ({ many }) => ({
  usuariosPerfis: many(usuariosPerfis),
}))
