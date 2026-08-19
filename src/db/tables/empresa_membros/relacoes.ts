import { relations } from 'drizzle-orm'
import { empresaMembros } from './tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const empresaMembrosRelations = relations(empresaMembros, ({ one }) => ({
  empresa: one(empresas, {
    fields: [empresaMembros.empresaId],
    references: [empresas.id],
  }),
  usuario: one(usuarios, {
    fields: [empresaMembros.usuarioId],
    references: [usuarios.id],
  }),
}))
