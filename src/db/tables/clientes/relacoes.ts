import { relations } from 'drizzle-orm'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'
import { clientes } from './tabela'

export const clientesRelations = relations(clientes, ({ one }) => ({
  profissional: one(usuarios, {
    fields: [clientes.profissionalId],
    references: [usuarios.id],
  }),
  empresa: one(empresas, {
    fields: [clientes.empresaId],
    references: [empresas.id],
  }),
}))
