import { relations } from 'drizzle-orm'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'
import { convitesEmpresa } from './tabela'

export const convitesEmpresaRelations = relations(
  convitesEmpresa,
  ({ one }) => ({
    empresa: one(empresas, {
      fields: [convitesEmpresa.empresaId],
      references: [empresas.id],
    }),
    remetente: one(usuarios, {
      fields: [convitesEmpresa.remetenteId],
      references: [usuarios.id],
      relationName: 'convitesEnviados',
    }),
    destinatario: one(usuarios, {
      fields: [convitesEmpresa.destinatarioId],
      references: [usuarios.id],
      relationName: 'convitesRecebidos',
    }),
  }),
)
