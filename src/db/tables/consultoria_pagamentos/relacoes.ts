import { relations } from 'drizzle-orm'
import { consultoriaPagamentos } from './tabela'
import { consultoriaAgendamentos } from '../consultoria_agendamentos/tabela'
import { consultoriaReservas } from '../consultoria_reservas/tabela'

export const consultoriaPagamentosRelations = relations(
  consultoriaPagamentos,
  ({ one }) => ({
    reserva: one(consultoriaReservas, {
      fields: [consultoriaPagamentos.reservaId],
      references: [consultoriaReservas.id],
    }),
    agendamento: one(consultoriaAgendamentos, {
      fields: [consultoriaPagamentos.agendamentoId],
      references: [consultoriaAgendamentos.id],
    }),
  }),
)
