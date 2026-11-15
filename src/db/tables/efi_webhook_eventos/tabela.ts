import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { cobrancasPix } from '../cobrancas_pix/tabela'

/**
 * Cada Pix que a Efí avisou ter recebido — o diário do webhook.
 *
 * ## Por que existe, se a cobrança já guarda o `end_to_end_id`
 *
 * Porque o webhook chega antes de sabermos se ele vale: pode ser repetição,
 * pode citar um txid desconhecido, pode trazer valor divergente. Esta tabela
 * guarda **o que chegou e o que foi decidido**, inclusive quando a decisão foi
 * ignorar — é o que permite responder "a Efí avisou?" sem depender de log.
 *
 * `identificador_evento` (o `endToEndId`) é único: a segunda entrega do mesmo
 * Pix não grava, e o processamento sabe que é repetição.
 *
 * O payload guardado é o resumo do Pix, nunca cabeçalhos nem o token de
 * autenticação do webhook.
 */
export const efiWebhookEventos = pgTable(
  'efi_webhook_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identificadorEvento: varchar('identificador_evento', { length: 64 }).notNull(),
    txid: varchar('txid', { length: 35 }),
    cobrancaId: uuid('cobranca_id').references(() => cobrancasPix.id, {
      onDelete: 'set null',
    }),
    /** `recebido`, `processado`, `repetido`, `ignorado`, `erro`. */
    situacao: varchar('situacao', { length: 20 }).notNull(),
    detalhe: varchar('detalhe', { length: 300 }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    identificadorUnico: uniqueIndex('efi_webhook_eventos_identificador_unico').on(
      t.identificadorEvento,
    ),
    txidIdx: index('efi_webhook_eventos_txid_idx').on(t.txid),
  }),
)
