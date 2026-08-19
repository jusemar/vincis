import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Etapas do checklist de um Atendimento.
 *
 * São uma **cópia** das etapas que o serviço tinha no catálogo no dia da
 * contratação, não um vínculo com ele. Por isso o item vive aqui e não em
 * `servicos`: quando o prestador reescrever o checklist do catálogo amanhã, o
 * Atendimento de ontem continua com as etapas que foram combinadas com aquele
 * Cliente. Mudar o catálogo não pode reescrever trabalho já contratado.
 *
 * `visibilidade` separa o que o Cliente acompanha do que é organização interna
 * da equipe — a etapa interna nem chega a ser selecionada na consulta do
 * portal. `origem` guarda de onde a etapa veio (catálogo, mão da equipe ou uma
 * solicitação formal registrada no Protocolo), o que dá contexto ao histórico.
 */
export const atendimentoChecklistItens = pgTable(
  'atendimento_checklist_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    /** `cliente` acompanha no portal; `interno` fica só com a equipe. */
    visibilidade: varchar('visibilidade', { length: 20 })
      .notNull()
      .default('cliente'),
    /** `catalogo`, `equipe` ou `solicitacao`. */
    origem: varchar('origem', { length: 20 }).notNull().default('catalogo'),
    ordem: integer('ordem').notNull().default(0),
    concluido: boolean('concluido').notNull().default(false),
    /** Quem marcou e quando. Nulos enquanto a etapa está pendente. */
    concluidoEm: timestamp('concluido_em'),
    concluidoPor: uuid('concluido_por').references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A leitura é sempre "as etapas deste Atendimento, na ordem".
    doAtendimentoIdx: index('atendimento_checklist_atendimento_idx').on(
      t.atendimentoId,
      t.ordem,
    ),
  }),
)
