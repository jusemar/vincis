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
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Proposta de um prestador para uma oportunidade pública.
 *
 * Tabela separada — e não colunas na oportunidade — porque a relação é de um
 * para muitos por natureza: a solicitação existe para receber várias respostas
 * e ser comparada. É também o que torna a **privacidade** possível de garantir
 * no SQL: a listagem do prestador filtra por `prestador_id` e nunca traz linha
 * de outro; só a consulta do Cliente dono da oportunidade lê o conjunto todo.
 *
 * O trio `mensagem` / `valor_centavos` / `prazo_estimado_dias` é o mínimo desta
 * primeira versão. `valor_centavos` é nulo quando o prestador prefere combinar
 * depois — gravar zero afirmaria um preço que ninguém ofereceu. Contraproposta,
 * negociação e aceite ainda não existem, e é por isso que `status` já nasce
 * como coluna: a evolução acrescenta valores a ela, sem mudar o formato.
 */
export const oportunidadePropostas = pgTable(
  'oportunidade_propostas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oportunidadeId: uuid('oportunidade_id')
      .notNull()
      .references(() => oportunidades.id, { onDelete: 'cascade' }),
    /** Quem se propõe. Sempre da sessão, nunca da requisição. */
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    mensagem: text('mensagem').notNull(),
    /** Nulo = "a combinar". Nunca zero fictício. */
    valorCentavos: integer('valor_centavos'),
    prazoEstimadoDias: integer('prazo_estimado_dias'),
    /**
     * Validade **comercial** da proposta — até quando ela pode ser aceita.
     *
     * Não se confunde com `prazo_estimado_dias`, que é quanto tempo o trabalho
     * leva depois de contratado. Uma proposta pode valer 24 horas e prometer 30
     * dias de execução. Nula nas propostas anteriores a esta etapa, que por
     * isso seguem valendo enquanto a oportunidade estiver ativa.
     */
    validaAte: timestamp('valida_ate'),
    /** `enviada` | `aceita`. Recusa da proposta em si não existe nesta etapa. */
    status: varchar('status', { length: 20 }).notNull().default('enviada'),
    /** Momento do aceite comercial pelo Cliente. Carimbo do banco. */
    aceitaEm: timestamp('aceita_em'),
    /** Valor efetivamente acordado — o da proposta ou o da contraproposta. */
    valorAcordadoCentavos: integer('valor_acordado_centavos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * Uma proposta por prestador em cada oportunidade.
     *
     * É esta linha — e não o código da action — que impede o clique duplo de
     * virar duas propostas. Revisar o que foi proposto reaproveita o mesmo
     * registro justamente porque o banco não deixaria criar outro.
     */
    unicaPorPrestador: uniqueIndex('oportunidade_propostas_unica').on(
      t.oportunidadeId,
      t.prestadorId,
    ),
    /**
     * Um acordo comercial por oportunidade.
     *
     * Índice parcial: quantas propostas quiser, uma aceita só. É o que impede
     * duas abas do Cliente de fecharem dois acordos para o mesmo pedido — a
     * segunda transação falha no banco, e não numa checagem de aplicação que
     * poderia perder a corrida.
     */
    umAcordoPorOportunidade: uniqueIndex('oportunidade_propostas_acordo_unico')
      .on(t.oportunidadeId)
      .where(sql`status = 'aceita'`),
    // O Cliente compara as propostas de uma oportunidade, em ordem de chegada.
    oportunidadeIdx: index('oportunidade_propostas_oportunidade_idx').on(
      t.oportunidadeId,
      t.createdAt,
    ),
    // O prestador consulta "já respondi esta?" e "o que eu enviei".
    prestadorIdx: index('oportunidade_propostas_prestador_idx').on(
      t.prestadorId,
      t.createdAt,
    ),
  }),
)
