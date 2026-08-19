import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { empresas } from '../empresas/tabela'
import { usuarioStatusEnum } from '../../enums'

/**
 * Verificação de identidade da conta.
 *
 * São dois métodos independentes e que não se sobrescrevem:
 *
 * - **E-mail**: o próprio usuário clica no link recebido (`email_verificado`).
 * - **WhatsApp**: o Gestor Vincis confirma a identidade pelo número cadastrado
 *   e registra a decisão (`whatsapp_verificado`).
 *
 * Não existe coluna `conta_verificada`: ela é derivada dos dois campos acima
 * (ver `lib/verificacao-conta.ts`). Guardar um terceiro booleano criaria uma
 * fonte de verdade capaz de divergir das outras duas.
 *
 * Confirmar pelo WhatsApp nunca marca o e-mail como verificado — isso seria
 * afirmar um fato que não ocorreu.
 */
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').references(() => empresas.id),
  nome: varchar('nome', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  whatsapp: varchar('whatsapp', { length: 20 }).unique(),
  senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
  emailVerificado: boolean('email_verificado').default(false).notNull(),
  emailVerificadoEm: timestamp('email_verificado_em'),
  whatsappVerificado: boolean('whatsapp_verificado').default(false).notNull(),
  whatsappVerificadoEm: timestamp('whatsapp_verificado_em'),
  // Gestor Vincis responsável pela confirmação manual. Auto-referência: o
  // gestor também é um usuário.
  whatsappVerificadoPorId: uuid('whatsapp_verificado_por_id').references(
    (): AnyPgColumn => usuarios.id,
  ),
  ultimoLoginEm: timestamp('ultimo_login_em'),
  status: usuarioStatusEnum('status').notNull().default('pendente_email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
