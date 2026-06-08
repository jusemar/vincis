import { relations } from 'drizzle-orm'
import { usuarios } from './tabela'
import { empresas } from '../empresas/tabela'
import { usuariosPerfis } from '../usuarios_perfis/tabela'

export const usuariosRelations = relations(usuarios, ({ one, many }) => ({
  empresa: one(empresas, {
    fields: [usuarios.empresaId],
    references: [empresas.id],
  }),
  usuariosPerfis: many(usuariosPerfis),
}))
