import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Comunicado institucional da Vincis.
 *
 * É a plataforma falando com quem a usa: novidade de produto, janela de
 * manutenção, aviso de normalização, mudança de regra, destaque do mês. Nada
 * aqui é operação de ninguém — nenhum protocolo, nenhum Cliente, nenhum
 * Atendimento entra nesta tabela.
 *
 * Por isso ela não se confunde com as duas vizinhas, e por isso é uma terceira
 * tabela em vez de uma coluna `tipo` nas outras:
 *
 * - `notificacoes` é atenção pessoal: tem destinatário e estado de leitura;
 * - `atendimento_eventos` é auditoria de um protocolo específico;
 * - `comunicados` é mural: um texto só, o mesmo para toda uma audiência, sem
 *   dono e sem leitura individual.
 *
 * `publicado_em` é separado de `created_at` de propósito: o Gestor escreve hoje
 * e agenda o aviso de manutenção para a data em que ele passa a valer. Enquanto
 * o status for `rascunho`, nada disso aparece para ninguém.
 */
export const comunicados = pgTable(
  'comunicados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `novidade`, `aviso`, `manutencao`, `sistema`, `destaque`. */
    tipo: varchar('tipo', { length: 20 }).notNull(),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    /** Texto curto exibido no card do Dashboard. */
    resumo: text('resumo').notNull(),
    /** `todos`, `prestadores`, `clientes`. */
    audiencia: varchar('audiencia', { length: 20 }).notNull().default('todos'),
    /** `rascunho`, `publicado`, `arquivado`. */
    status: varchar('status', { length: 20 }).notNull().default('rascunho'),
    /**
     * Momento a partir do qual o comunicado vale.
     *
     * Nulo enquanto rascunho. Publicar sem data preenche com o instante do
     * clique; com data futura, o mural só passa a mostrar quando ela chegar.
     */
    publicadoEm: timestamp('publicado_em'),
    /** Gestor que assinou o comunicado. Fica para auditoria. */
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A consulta do mural é sempre "publicados desta audiência, mais recentes
    // primeiro" — é este índice que a atende.
    muralIdx: index('comunicados_mural_idx').on(
      t.status,
      t.audiencia,
      t.publicadoEm,
    ),
  }),
)
