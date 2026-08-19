import { relations } from 'drizzle-orm'
import { eventosAuditoria } from './tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const eventosAuditoriaRelations = relations(
  eventosAuditoria,
  ({ one }) => ({
    autor: one(usuarios, {
      fields: [eventosAuditoria.autorId],
      references: [usuarios.id],
      relationName: 'autor_evento_auditoria',
    }),
    usuario: one(usuarios, {
      fields: [eventosAuditoria.usuarioId],
      references: [usuarios.id],
      relationName: 'usuario_evento_auditoria',
    }),
    empresa: one(empresas, {
      fields: [eventosAuditoria.empresaId],
      references: [empresas.id],
    }),
  }),
)
