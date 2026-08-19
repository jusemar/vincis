import { relations } from 'drizzle-orm'
import { empresas } from './tabela'
import { usuarios } from '../usuarios/tabela'
import { empresaMembros } from '../empresa_membros/tabela'
import { clientes } from '../clientes/tabela'

export const empresasRelations = relations(empresas, ({ many }) => ({
  usuarios: many(usuarios),
  membros: many(empresaMembros),
  clientes: many(clientes),
}))
