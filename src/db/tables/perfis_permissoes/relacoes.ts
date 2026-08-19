import { relations } from 'drizzle-orm'
import { perfisPermissoes } from './tabela'
import { perfis } from '../perfis/tabela'
import { permissoes } from '../permissoes/tabela'

export const perfisPermissoesRelations = relations(perfisPermissoes, ({ one }) => ({
  perfil: one(perfis, {
    fields: [perfisPermissoes.perfilId],
    references: [perfis.id],
  }),
  permissao: one(permissoes, {
    fields: [perfisPermissoes.permissaoId],
    references: [permissoes.id],
  }),
}))
