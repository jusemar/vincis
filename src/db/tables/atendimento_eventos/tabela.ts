import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Histórico do Atendimento — o que realmente aconteceu, com data real.
 *
 * Alimenta a aba "Histórico" do painel. Só recebe fato consumado (contratação
 * criada, Atendimento aberto, responsável definido, arquivo anexado); nada é
 * inserido para preencher tela.
 *
 * `descricao` é o texto já pronto para leitura e `metadados` guarda o mínimo
 * estruturado do evento. Conteúdo de conversa nunca entra aqui.
 */
export const atendimentoEventos = pgTable(
  'atendimento_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    tipo: varchar('tipo', { length: 40 }).notNull(),
    descricao: varchar('descricao', { length: 240 }).notNull(),
    /** Quem provocou o evento. Nulo quando a origem é o próprio sistema. */
    autorId: uuid('autor_id').references(() => usuarios.id),
    /**
     * O Cliente pode ver este evento no histórico dele.
     *
     * Nem tudo que a equipe registra interessa — ou deve chegar — ao Cliente:
     * a definição do responsável interno é operação da casa. A decisão fica
     * gravada na linha e é aplicada como filtro no SQL do portal, não como
     * escolha de renderização.
     */
    visivelCliente: boolean('visivel_cliente').notNull().default(true),
    metadados: jsonb('metadados'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    linhaDoTempoIdx: index('atendimento_eventos_linha_do_tempo_idx').on(
      t.atendimentoId,
      t.createdAt,
    ),
  }),
)
