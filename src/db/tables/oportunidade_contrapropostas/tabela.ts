import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { oportunidadePropostas } from '../oportunidade_propostas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Contraproposta do Cliente sobre uma proposta recebida.
 *
 * Tabela própria, e não colunas na proposta, porque a negociação é uma
 * **sequência**: o Cliente contrapropõe, o prestador recusa, o Cliente
 * contrapropõe de novo. Guardar "o valor contraproposto" numa coluna da
 * proposta apagaria a rodada anterior a cada tentativa — e é exatamente o
 * histórico que precisa ser reconstruível.
 *
 * Também não é mensagem de conversa: tem valor, tem estado e tem efeito
 * comercial. Conversa não tem nenhum dos três.
 */
export const oportunidadeContrapropostas = pgTable(
  'oportunidade_contrapropostas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propostaId: uuid('proposta_id')
      .notNull()
      .references(() => oportunidadePropostas.id, { onDelete: 'cascade' }),
    /** Sempre o Cliente dono da oportunidade. Vem da sessão. */
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    /** Sempre maior que zero: contraproposta sem valor não é contraproposta. */
    valorCentavos: integer('valor_centavos').notNull(),
    mensagem: text('mensagem'),
    /** `pendente` | `aceita` | `recusada`. */
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    respondidaEm: timestamp('respondida_em'),
    respondidaPor: uuid('respondida_por').references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * Uma contraproposta pendente por vez em cada proposta.
     *
     * Índice parcial: as resolvidas continuam existindo aos montes (é o
     * histórico), mas duas em aberto ao mesmo tempo não passam — nem por clique
     * duplo, nem por duas abas. É o banco que decide, não o código.
     */
    umaPendentePorProposta: uniqueIndex(
      'oportunidade_contrapropostas_pendente_unica',
    )
      .on(t.propostaId)
      .where(sql`status = 'pendente'`),
    propostaIdx: index('oportunidade_contrapropostas_proposta_idx').on(
      t.propostaId,
      t.createdAt,
    ),
  }),
)
