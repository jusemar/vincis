import { relations } from 'drizzle-orm'
import { cobrancasPix } from './tabela'
import { efiWebhookEventos } from '../efi_webhook_eventos/tabela'
import { usuarios } from '../usuarios/tabela'

export const cobrancasPixRelations = relations(cobrancasPix, ({ one, many }) => ({
  clienteUsuario: one(usuarios, {
    fields: [cobrancasPix.clienteUsuarioId],
    references: [usuarios.id],
    relationName: 'cliente_cobranca_pix',
  }),
  prestador: one(usuarios, {
    fields: [cobrancasPix.prestadorId],
    references: [usuarios.id],
    relationName: 'prestador_cobranca_pix',
  }),
  eventosWebhook: many(efiWebhookEventos),
}))
