import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Catálogo de serviços do prestador.
 *
 * É o que ele oferece publicamente — não é uma contratação. Um item daqui pode
 * originar muitas contratações (`contratacoes_servico`), e continua existindo
 * mesmo sem nenhuma. Confundir as duas coisas faria o histórico do cliente
 * mudar sempre que o prestador editasse o preço.
 *
 * `modelo_preco` decide o significado de `valor_centavos`:
 * - `fixo`: preço final;
 * - `a_partir_de`: valor-base, o final depende do caso;
 * - `por_hora`: valor da hora;
 * - `sob_orcamento`: sem valor — a coluna fica nula de propósito.
 */
export const servicos = pgTable(
  'servicos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    nome: varchar('nome', { length: 160 }).notNull(),
    descricaoCurta: varchar('descricao_curta', { length: 280 }).notNull(),
    descricaoDetalhada: text('descricao_detalhada'),
    categoria: varchar('categoria', { length: 30 }).notNull().default('contabil'),
    /** Itens inclusos, exibidos como chips no perfil público. */
    itensIncluidos: text('itens_incluidos').array().notNull().default([]),
    /**
     * Etapas padrão da execução deste serviço.
     *
     * É o modelo do checklist: quando alguém contrata, o Atendimento recebe uma
     * cópia destas etapas e passa a viver a vida dele. Não é o que o Cliente
     * preenche nem o que ele contrata — é como o prestador organiza o próprio
     * trabalho. Vazio significa "sem checklist padrão".
     */
    checklistModelo: text('checklist_modelo').array().notNull().default([]),
    modeloPreco: varchar('modelo_preco', { length: 20 })
      .notNull()
      .default('fixo'),
    /** Nulo quando `modelo_preco = 'sob_orcamento'`. Nunca zero fictício. */
    valorCentavos: integer('valor_centavos'),
    prazoEstimadoDias: integer('prazo_estimado_dias'),
    ativo: boolean('ativo').notNull().default(true),
    publico: boolean('publico').notNull().default(true),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A vitrine pública filtra por prestador + ativo + publico e ordena por ordem.
    vitrineIdx: index('servicos_vitrine_idx').on(
      t.prestadorId,
      t.ativo,
      t.publico,
      t.ordem,
    ),
  }),
)
