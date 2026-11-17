import { relations } from 'drizzle-orm'
import { cmsCardsHome } from './tabela'
import { cmsPaginas } from '../cms_paginas/tabela'
import { usuarios } from '../usuarios/tabela'

export const cmsCardsHomeRelations = relations(cmsCardsHome, ({ one }) => ({
  pagina: one(cmsPaginas, {
    fields: [cmsCardsHome.paginaId],
    references: [cmsPaginas.id],
  }),
  atualizadoPor: one(usuarios, {
    fields: [cmsCardsHome.atualizadoPorId],
    references: [usuarios.id],
  }),
}))
