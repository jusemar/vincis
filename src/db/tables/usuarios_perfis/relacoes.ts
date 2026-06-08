import { relations } from 'drizzle-orm'
import { usuariosPerfis } from './tabela'
import { usuarios } from '../usuarios/tabela'
import { perfis } from '../perfis/tabela'

export const usuariosPerfisRelations = relations(usuariosPerfis, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [usuariosPerfis.usuarioId],
    references: [usuarios.id],
  }),
  perfil: one(perfis, {
    fields: [usuariosPerfis.perfilId],
    references: [perfis.id],
  }),
}))
