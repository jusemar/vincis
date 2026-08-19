import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentoConvites } from '../atendimento_convites/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Quem participa de um Atendimento.
 *
 * Existe desde já como tabela própria — e não como uma coluna de responsável
 * solitária — porque o Atendimento nasce preparado para receber colaboradores
 * convidados. Hoje o único integrante é o responsável inicial; amanhã bastará
 * inserir linhas, sem migrar modelo.
 *
 * `papel` distingue o responsável dos convidados. O par (atendimento, usuário)
 * é único: convidar duas vezes não duplica acesso.
 *
 * `convite_id` diz **por onde** a pessoa entrou. Nulo é o caso normal de quem
 * foi atribuído direto por já pertencer à equipe; preenchido aponta para a
 * negociação que resultou no aceite, e é o que permite recuperar depois o
 * escopo e o valor acordado sem duplicá-los aqui.
 */
export const atendimentoParticipantes = pgTable(
  'atendimento_participantes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id),
    papel: varchar('papel', { length: 20 }).notNull().default('convidado'),
    conviteId: uuid('convite_id').references(() => atendimentoConvites.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    unico: uniqueIndex('atendimento_participantes_unico').on(
      t.atendimentoId,
      t.usuarioId,
    ),
    usuarioIdx: index('atendimento_participantes_usuario_idx').on(t.usuarioId),
  }),
)
