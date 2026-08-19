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
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Convite de colaboração **naquele Atendimento**.
 *
 * É deliberadamente uma terceira tabela, e não um reaproveitamento de
 * `convites_empresa` nem de `colaboracoes_cliente`:
 *
 * - `convites_empresa` cria vínculo permanente com o escritório
 *   (`empresa_membros`);
 * - `colaboracoes_cliente` concede acesso a um Cliente inteiro;
 * - este concede acesso a **um** Atendimento e morre com ele.
 *
 * O que justifica a tabela própria é a negociação: escopo combinado, valor
 * oferecido, contraproposta e valor acordado são dados estruturados do acordo, e
 * não texto solto numa conversa. Guardá-los aqui é o que permite responder
 * depois "por quanto este Atendimento foi repassado, e para quem".
 *
 * Nenhum valor daqui é do Cliente: é o combinado entre quem convida e quem
 * executa. Por isso nada nesta tabela alcança o portal `/cliente`.
 */
export const atendimentoConvites = pgTable(
  'atendimento_convites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    remetenteId: uuid('remetente_id')
      .notNull()
      .references(() => usuarios.id),
    destinatarioId: uuid('destinatario_id')
      .notNull()
      .references(() => usuarios.id),
    /**
     * O que está sendo pedido ao convidado, escrito por quem convida.
     *
     * É o escopo do acordo — não se confunde com o título do Atendimento nem
     * com o serviço contratado pelo Cliente.
     */
    escopo: text('escopo').notNull(),
    /** Proposta inicial de quem convida. Nulo quando o convite é sem valor. */
    valorOferecidoCentavos: integer('valor_oferecido_centavos'),
    /** Última contraproposta do convidado. Nulo enquanto ele não fizer uma. */
    valorContrapropostaCentavos: integer('valor_contraproposta_centavos'),
    /**
     * Valor congelado no aceite.
     *
     * Gravado uma única vez, no momento em que o convidado aceita, a partir da
     * proposta que estava valendo. Depois disso nem remetente nem convidado
     * reescrevem: é o que foi acordado.
     */
    valorAcordadoCentavos: integer('valor_acordado_centavos'),
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    expiraEm: timestamp('expira_em').notNull(),
    respondidoEm: timestamp('respondido_em'),
    revogadoEm: timestamp('revogado_em'),
    revogadoPorId: uuid('revogado_por_id').references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Mesma garantia de `colaboracoes_cliente`: um convidado não acumula dois
    // convites vivos para o mesmo Atendimento. A checagem é do banco, não da
    // tela — dois cliques simultâneos não criam duas negociações.
    vivoUnico: uniqueIndex('atendimento_convites_vivo_unico')
      .on(t.atendimentoId, t.destinatarioId)
      .where(sql`${t.status} in ('pendente', 'aceito')`),
    atendimentoIdx: index('atendimento_convites_atendimento_idx').on(
      t.atendimentoId,
      t.status,
    ),
    destinatarioIdx: index('atendimento_convites_destinatario_idx').on(
      t.destinatarioId,
      t.status,
    ),
  }),
)
