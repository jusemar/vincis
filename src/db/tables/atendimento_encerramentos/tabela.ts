import { sql } from 'drizzle-orm'
import {
  check,
  index,
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
 * Encerramento administrativo de um Atendimento parado — "Encerrado sem conclusão".
 *
 * ## Por que uma tabela, e não colunas em `atendimentos`
 *
 * Porque a observação administrativa é **interna**: o Cliente nunca a lê.
 * Mantê-la fora da linha que todas as telas do Cliente consultam faz o
 * isolamento ser estrutural — nenhuma consulta do portal precisa lembrar de não
 * selecioná-la, porque ela simplesmente não está lá.
 *
 * ## O que esta linha NÃO decide
 *
 * Dinheiro. Encerrar por falta de retorno não estorna, não credita e não
 * promete nada: o profissional pode ter feito parte do trabalho e ter direito
 * ao pagamento. Questão financeira é analisada à parte, se alguém procurar a
 * Vincis.
 *
 * Um encerramento por Atendimento (`atendimento_id` único): o estado é
 * terminal, e reabrir seria uma regra própria.
 */
export const atendimentoEncerramentos = pgTable(
  'atendimento_encerramentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    /** O Gestor da Plataforma que encerrou. */
    gestorId: uuid('gestor_id')
      .notNull()
      .references(() => usuarios.id),
    /** Ver `MOTIVOS_ENCERRAMENTO_SEM_CONCLUSAO`. */
    motivo: varchar('motivo', { length: 40 }).notNull(),
    /** Nota administrativa. Interna: nunca exibida ao Cliente. */
    observacaoInterna: text('observacao_interna').notNull(),
    /** O status em que o Atendimento estava ao ser encerrado. */
    statusAnterior: varchar('status_anterior', { length: 30 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    atendimentoUnico: uniqueIndex('atendimento_encerramentos_atendimento_unico').on(
      t.atendimentoId,
    ),
    gestorIdx: index('atendimento_encerramentos_gestor_idx').on(t.gestorId, t.createdAt),
    motivoValido: check(
      'atendimento_encerramentos_motivo_valido',
      sql`motivo in ('cliente_nao_responde', 'profissional_nao_responde', 'ambos_nao_respondem', 'outro')`,
    ),
    observacaoPreenchida: check(
      'atendimento_encerramentos_observacao_preenchida',
      sql`length(btrim(observacao_interna)) >= 10`,
    ),
  }),
)
