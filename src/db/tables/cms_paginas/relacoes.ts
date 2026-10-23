import { relations } from 'drizzle-orm'
import { cmsPaginas } from './tabela'
import { cmsItensNavegacao } from '../cms_itens_navegacao/tabela'
import { usuarios } from '../usuarios/tabela'

export const cmsPaginasRelations = relations(cmsPaginas, ({ one, many }) => ({
  autor: one(usuarios, {
    fields: [cmsPaginas.autorId],
    references: [usuarios.id],
  }),
  atualizadoPor: one(usuarios, {
    fields: [cmsPaginas.atualizadoPorId],
    references: [usuarios.id],
  }),
  itensNavegacao: many(cmsItensNavegacao),
}))
