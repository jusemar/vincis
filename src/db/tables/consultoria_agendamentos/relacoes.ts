import { relations } from 'drizzle-orm'
import { consultoriaAgendamentos } from './tabela'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'
import { consultoriaReservas } from '../consultoria_reservas/tabela'
import { usuarios } from '../usuarios/tabela'

export const consultoriaAgendamentosRelations = relations(
  consultoriaAgendamentos,
  ({ one }) => ({
    reserva: one(consultoriaReservas, {
      fields: [consultoriaAgendamentos.reservaId],
      references: [consultoriaReservas.id],
    }),
    configuracao: one(consultoriaConfiguracoes, {
      fields: [consultoriaAgendamentos.configuracaoId],
      references: [consultoriaConfiguracoes.id],
    }),
    prestador: one(usuarios, {
      fields: [consultoriaAgendamentos.prestadorId],
      references: [usuarios.id],
      relationName: 'prestador_do_agendamento',
    }),
    cliente: one(usuarios, {
      fields: [consultoriaAgendamentos.clienteUsuarioId],
      references: [usuarios.id],
      relationName: 'cliente_do_agendamento',
    }),
  }),
)
