import { relations } from 'drizzle-orm'
import { consultoriaReservas } from './tabela'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'
import { usuarios } from '../usuarios/tabela'

export const consultoriaReservasRelations = relations(
  consultoriaReservas,
  ({ one }) => ({
    configuracao: one(consultoriaConfiguracoes, {
      fields: [consultoriaReservas.configuracaoId],
      references: [consultoriaConfiguracoes.id],
    }),
    cliente: one(usuarios, {
      fields: [consultoriaReservas.clienteUsuarioId],
      references: [usuarios.id],
    }),
  }),
)
