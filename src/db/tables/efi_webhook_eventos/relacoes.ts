import { relations } from 'drizzle-orm'
import { efiWebhookEventos } from './tabela'
import { cobrancasPix } from '../cobrancas_pix/tabela'

export const efiWebhookEventosRelations = relations(efiWebhookEventos, ({ one }) => ({
  cobranca: one(cobrancasPix, {
    fields: [efiWebhookEventos.cobrancaId],
    references: [cobrancasPix.id],
  }),
}))
