import { relations } from 'drizzle-orm'
import { cmsItensNavegacao } from './tabela'
import { cmsGruposNavegacao } from '../cms_grupos_navegacao/tabela'
import { cmsPaginas } from '../cms_paginas/tabela'

export const cmsItensNavegacaoRelations = relations(cmsItensNavegacao, ({ one, many }) => ({
  pai: one(cmsItensNavegacao, {
    fields: [cmsItensNavegacao.paiId],
    references: [cmsItensNavegacao.id],
    relationName: 'submenu_cms',
  }),
  filhos: many(cmsItensNavegacao, { relationName: 'submenu_cms' }),
  grupo: one(cmsGruposNavegacao, {
    fields: [cmsItensNavegacao.grupoId],
    references: [cmsGruposNavegacao.id],
  }),
  pagina: one(cmsPaginas, {
    fields: [cmsItensNavegacao.paginaId],
    references: [cmsPaginas.id],
  }),
}))
