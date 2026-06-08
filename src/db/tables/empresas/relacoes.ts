import { relations } from 'drizzle-orm'
import { empresas } from './tabela'
import { usuarios } from '../usuarios/tabela'

export const empresasRelations = relations(empresas, ({ many }) => ({
  usuarios: many(usuarios),
}))
