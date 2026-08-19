import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Trilha de auditoria de ações críticas.
 *
 * Segue o formato exigido pelo AGENTS.md (usuarioId, empresaId, data, acao,
 * entidade, registroAfetado, ip). `autorId` é quem executou a ação e
 * `usuarioId` é o sujeito afetado — numa confirmação pela Gestão os dois são
 * pessoas diferentes, e essa distinção é justamente o que dá valor ao registro.
 *
 * `metadados` guarda apenas o mínimo estruturado da decisão (método e origem).
 * Nunca guardar conteúdo de conversa nem dado sensível.
 */
export const eventosAuditoria = pgTable(
  'eventos_auditoria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    acao: varchar('acao', { length: 80 }).notNull(),
    entidade: varchar('entidade', { length: 60 }).notNull(),
    registroAfetado: uuid('registro_afetado'),
    /** Quem executou a ação. */
    autorId: uuid('autor_id').references(() => usuarios.id),
    /** Sujeito da ação, quando é uma conta de usuário. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    empresaId: uuid('empresa_id').references(() => empresas.id),
    origem: varchar('origem', { length: 40 }).notNull(),
    ip: varchar('ip', { length: 45 }),
    metadados: jsonb('metadados'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    acaoIdx: index('eventos_auditoria_acao_idx').on(t.acao, t.createdAt),
    usuarioIdx: index('eventos_auditoria_usuario_idx').on(t.usuarioId),
    autorIdx: index('eventos_auditoria_autor_idx').on(t.autorId),
  }),
)
