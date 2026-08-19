import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { empresaSegmentoEnum, empresaTipoEnum, empresaStatusEnum } from '../../enums'

export const empresas = pgTable('empresas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 255 }).notNull(),
  tipo: empresaTipoEnum('tipo').notNull().default('cliente'),
  segmento: empresaSegmentoEnum('segmento'),
  status: empresaStatusEnum('status').notNull().default('ativo'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
