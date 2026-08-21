import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { oportunidadePropostas } from '../oportunidade_propostas/tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Pagamento de um acordo comercial nascido de uma oportunidade pública.
 *
 * ## Esta etapa é uma SIMULAÇÃO, e a tabela diz isso
 *
 * A plataforma ainda não tem gateway. `origem` existe justamente para que o
 * registro nunca precise ser adivinhado depois: hoje toda linha nasce
 * `simulado`, e o dia em que existir cobrança real as linhas novas nascerão com
 * a origem daquele provedor. Nenhuma consulta precisa supor nada — basta ler a
 * coluna. `referencia` segue o formato `SIM-AAAA-XXXXXXXX`, escolhido de
 * propósito para **não** se parecer com identificador de transação de nenhum
 * gateway: quem olhar o banco sabe na hora que aquilo não passou por dinheiro.
 *
 * Nada de dado financeiro é guardado — não há cartão, CVV, titular, bandeira
 * nem meio de pagamento. A simulação não coleta nenhum desses campos, então não
 * existe risco de eles chegarem aqui por descuido: a tabela simplesmente não
 * tem onde colocá-los.
 *
 * ## Uma oportunidade, um pagamento
 *
 * `oportunidade_id` é único. É esta linha — e não o botão desabilitado da tela,
 * nem uma checagem de aplicação que perderia a corrida — que garante que dois
 * cliques, duas abas ou duas requisições simultâneas produzam **um** pagamento
 * aprovado e, por consequência, **um** Atendimento. A segunda transação esbarra
 * no índice, não grava, e passa a ler o registro do vencedor.
 *
 * `valor_centavos` tem `check > 0`: um acordo pago por zero não é um acordo
 * pago. A coluna é `not null` porque só existe linha aqui quando houve valor.
 */
export const oportunidadePagamentos = pgTable(
  'oportunidade_pagamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oportunidadeId: uuid('oportunidade_id')
      .notNull()
      .references(() => oportunidades.id, { onDelete: 'cascade' }),
    /** A proposta aceita que está sendo paga. */
    propostaId: uuid('proposta_id')
      .notNull()
      .references(() => oportunidadePropostas.id, { onDelete: 'cascade' }),
    /** Quem pagou. Sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Quem vai receber, quando existir repasse real. Hoje só rastreabilidade. */
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    valorCentavos: integer('valor_centavos').notNull(),
    /** `aprovado` é o único estado desta etapa. A coluna já nasce para os demais. */
    status: varchar('status', { length: 20 }).notNull().default('aprovado'),
    /** `simulado` hoje. O provedor real, quando existir. Nunca em branco. */
    origem: varchar('origem', { length: 20 }).notNull().default('simulado'),
    /** `SIM-AAAA-XXXXXXXX`. Único, para conciliação e para o suporte. */
    referencia: varchar('referencia', { length: 40 }).notNull(),
    aprovadoEm: timestamp('aprovado_em').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A trava de idempotência do fluxo inteiro.
    unicoPorOportunidade: uniqueIndex('oportunidade_pagamentos_unico').on(
      t.oportunidadeId,
    ),
    referenciaUnica: uniqueIndex('oportunidade_pagamentos_referencia_unica').on(
      t.referencia,
    ),
    clienteIdx: index('oportunidade_pagamentos_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    prestadorIdx: index('oportunidade_pagamentos_prestador_idx').on(
      t.prestadorId,
      t.createdAt,
    ),
    valorPositivo: check(
      'oportunidade_pagamentos_valor_positivo',
      sql`valor_centavos > 0`,
    ),
  }),
)
