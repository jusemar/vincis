import { relations } from 'drizzle-orm'
import { cmsGruposNavegacao } from './tabela'
import { cmsItensNavegacao } from '../cms_itens_navegacao/tabela'
import { usuarios } from '../usuarios/tabela'

export const cmsGruposNavegacaoRelations = relations(
  cmsGruposNavegacao,
  ({ one, many }) => ({
    atualizadoPor: one(usuarios, {
      fields: [cmsGruposNavegacao.atualizadoPorId],
      references: [usuarios.id],
    }),
    itens: many(cmsItensNavegacao),
  }),
)
