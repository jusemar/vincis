import { relations } from 'drizzle-orm'
import { sessoesUsuario } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const sessoesUsuarioRelations = relations(sessoesUsuario, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [sessoesUsuario.usuarioId],
    references: [usuarios.id],
  }),
}))
