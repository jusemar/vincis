import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Conversa do Atendimento.
 *
 * `escopo` é a única coisa que separa o que o Cliente lê do que é da equipe:
 *
 * - `cliente`: canal compartilhado com o Cliente proprietário;
 * - `interno`: nota da equipe, que o Cliente **nunca** recebe.
 *
 * A separação é por coluna, e não por uma flag de interface, porque a consulta
 * do portal do Cliente filtra `escopo = 'cliente'` no SQL. Uma nota interna não
 * chega ao navegador do Cliente nem por engano de renderização.
 *
 * `remetenteEhCliente` não existe de propósito: quem enviou é `autor_id`, e o
 * papel de cada pessoa vem do vínculo com o Atendimento — duplicar isso aqui
 * criaria duas verdades sobre a mesma coisa.
 */
export const atendimentoMensagens = pgTable(
  'atendimento_mensagens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    escopo: varchar('escopo', { length: 10 }).notNull().default('cliente'),
    conteudo: text('conteudo').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    conversaIdx: index('atendimento_mensagens_conversa_idx').on(
      t.atendimentoId,
      t.escopo,
      t.createdAt,
    ),
  }),
)
