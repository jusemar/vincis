import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { consultoriaAgendamentos } from '../consultoria_agendamentos/tabela'
import { consultoriaReservas } from '../consultoria_reservas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Pagamento **simulado** de uma consultoria agendada.
 *
 * ## Por que uma tabela própria, e não `oportunidade_pagamentos`
 *
 * Porque aquela tabela declara `oportunidade_id` e `proposta_id` como `not
 * null`, e a consultoria não tem nem uma nem outra. Só havia dois caminhos para
 * reaproveitá-la: afrouxar as duas colunas — destruindo justamente a garantia
 * que faz o pagamento de acordo ser idempotente — ou inventar uma oportunidade
 * de mentira para cada consultoria. O segundo poluiria os painéis com
 * solicitações que ninguém abriu.
 *
 * O que **é** compartilhado é o vocabulário do simulador: `origem`,
 * `referencia` no formato `SIM-AAAA-XXXXXXXX`, `status`. As duas tabelas falam
 * a mesma língua e são lidas pelas mesmas constantes de
 * `features/pagamentos/constants`.
 *
 * ## Esta etapa é uma simulação, e a tabela diz isso
 *
 * Nenhuma linha aqui passou por dinheiro. Não há cartão, CVV, titular,
 * bandeira, meio de pagamento nem chave PIX — e não é uma tela com campos
 * desabilitados: é a ausência da coleta, e a ausência das colunas.
 *
 * ## Só o aprovado é gravado
 *
 * Uma recusa simulada não produz contratação, não produz Atendimento e não
 * produz protocolo — não há o que conciliar depois. Gravá-la ocuparia a chave
 * única da reserva e impediria a nova tentativa que o Cliente tem direito de
 * fazer enquanto a reserva ainda vale. A recusa vira registro de auditoria, que
 * é onde ela pertence.
 *
 * `reserva_id` e `agendamento_id` são ambos únicos: uma reserva, um pagamento,
 * uma consultoria. É o banco — e não o botão — que garante que duplo clique e
 * F5 não cobrem duas vezes.
 */
export const consultoriaPagamentos = pgTable(
  'consultoria_pagamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservaId: uuid('reserva_id').notNull(),
    agendamentoId: uuid('agendamento_id').notNull(),
    /** Quem pagou. Sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id').notNull(),
    /** Quem receberá, quando existir repasse real. Hoje, rastreabilidade. */
    prestadorId: uuid('prestador_id').notNull(),
    /** O valor do snapshot da reserva — nunca o preço atual do Profissional. */
    valorCentavos: integer('valor_centavos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('aprovado'),
    /** `simulado` hoje. O provedor real, quando existir. Nunca em branco. */
    origem: varchar('origem', { length: 20 }).notNull().default('simulado'),
    referencia: varchar('referencia', { length: 40 }).notNull(),
    aprovadoEm: timestamp('aprovado_em').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    reservaFk: foreignKey({
      columns: [t.reservaId],
      foreignColumns: [consultoriaReservas.id],
      name: 'consultoria_pagamentos_reserva_fk',
    }),
    agendamentoFk: foreignKey({
      columns: [t.agendamentoId],
      foreignColumns: [consultoriaAgendamentos.id],
      name: 'consultoria_pagamentos_agendamento_fk',
    }),
    clienteFk: foreignKey({
      columns: [t.clienteUsuarioId],
      foreignColumns: [usuarios.id],
      name: 'consultoria_pagamentos_cliente_fk',
    }),
    prestadorFk: foreignKey({
      columns: [t.prestadorId],
      foreignColumns: [usuarios.id],
      name: 'consultoria_pagamentos_prestador_fk',
    }),
    reservaUnica: uniqueIndex('consultoria_pagamentos_reserva_unica').on(
      t.reservaId,
    ),
    agendamentoUnico: uniqueIndex('consultoria_pagamentos_agendamento_unico').on(
      t.agendamentoId,
    ),
    referenciaUnica: uniqueIndex('consultoria_pagamentos_referencia_unica').on(
      t.referencia,
    ),
    clienteIdx: index('consultoria_pagamentos_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    prestadorIdx: index('consultoria_pagamentos_prestador_idx').on(
      t.prestadorId,
      t.createdAt,
    ),
    valorPositivo: check(
      'consultoria_pagamentos_valor_positivo',
      sql`valor_centavos > 0`,
    ),
  }),
)
