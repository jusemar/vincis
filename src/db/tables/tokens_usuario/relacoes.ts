import { relations } from 'drizzle-orm'
import { tokensUsuario } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const tokensUsuarioRelations = relations(tokensUsuario, ({ one }) => ({
  usuario: one(usuarios, {
    fields: [tokensUsuario.usuarioId],
    references: [usuarios.id],
  }),
}))
