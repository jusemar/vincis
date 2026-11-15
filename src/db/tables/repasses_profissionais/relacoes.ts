import { relations } from 'drizzle-orm'
import { assinaturas } from '../assinaturas/tabela'
import { usuarios } from '../usuarios/tabela'
import { repassesProfissionais } from './tabela'

export const repassesProfissionaisRelations = relations(repassesProfissionais, ({ one }) => ({
  profissional: one(usuarios, {
    fields: [repassesProfissionais.profissionalId],
    references: [usuarios.id],
    relationName: 'profissional_repasse',
  }),
  clienteUsuario: one(usuarios, {
    fields: [repassesProfissionais.clienteUsuarioId],
    references: [usuarios.id],
    relationName: 'cliente_repasse',
  }),
  repassadoPor: one(usuarios, {
    fields: [repassesProfissionais.repassadoPorId],
    references: [usuarios.id],
    relationName: 'gestor_repasse',
  }),
  assinatura: one(assinaturas, {
    fields: [repassesProfissionais.assinaturaId],
    references: [assinaturas.id],
  }),
}))
