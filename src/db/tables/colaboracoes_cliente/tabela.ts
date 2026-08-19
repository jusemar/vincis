import { sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Convite de colaboração em cliente/serviço.
 *
 * É deliberadamente separado de `convites_empresa`: aquele cria vínculo
 * permanente com o escritório (`empresa_membros`), este concede acesso pontual
 * e revogável a um cliente específico, sem qualquer membership.
 *
 * `servico_id` já existe para a granularidade por serviço, mas fica nulo
 * enquanto a plataforma não tiver uma tabela real de serviços — hoje o escopo
 * efetivo é sempre o cliente inteiro (`escopo = 'cliente'`).
 */
export const colaboracoesCliente = pgTable(
  'colaboracoes_cliente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
    // Sem FK: a estrutura de serviços ainda não existe. Reservado para quando existir.
    servicoId: uuid('servico_id'),
    escopo: varchar('escopo', { length: 20 }).notNull().default('cliente'),
    // Origem do convite: escritório (com empresa) ou profissional individual.
    origem: varchar('origem', { length: 20 }).notNull(),
    empresaOrigemId: uuid('empresa_origem_id').references(() => empresas.id),
    remetenteId: uuid('remetente_id')
      .notNull()
      .references(() => usuarios.id),
    destinatarioId: uuid('destinatario_id')
      .notNull()
      .references(() => usuarios.id),
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    expiraEm: timestamp('expira_em').notNull(),
    respondidoEm: timestamp('respondido_em'),
    revogadoEm: timestamp('revogado_em'),
    revogadoPorId: uuid('revogado_por_id').references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Bloqueia duplicidade no banco: um mesmo destinatário não pode ter dois
    // convites vivos (pendente ou aceito) para o mesmo cliente.
    vivoUnique: uniqueIndex('colaboracoes_cliente_vivo_unique')
      .on(t.clienteId, t.destinatarioId)
      .where(sql`${t.status} in ('pendente', 'aceito')`),
    destinatarioStatusIdx: index('colaboracoes_cliente_destinatario_status_idx').on(
      t.destinatarioId,
      t.status,
    ),
    clienteStatusIdx: index('colaboracoes_cliente_cliente_status_idx').on(
      t.clienteId,
      t.status,
    ),
    remetenteIdx: index('colaboracoes_cliente_remetente_idx').on(t.remetenteId),
  }),
)
