import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { servicos } from '../servicos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Contratação de um serviço por um Cliente.
 *
 * É a instância: "Ana contratou de Carlos a Declaração de IRPF". Guarda um
 * *snapshot* do preço e do nome no momento do aceite — se o prestador reajustar
 * o catálogo depois, a contratação antiga não muda retroativamente. Por isso os
 * campos `*_snapshot` são gravados aqui e não lidos de `servicos` na exibição.
 *
 * `cliente_carteira_id` liga a contratação ao registro da carteira do prestador
 * (`clientes`). O vínculo é criado por referência explícita ao usuário, nunca
 * por coincidência de e-mail ou telefone.
 */
export const contratacoesServico = pgTable(
  'contratacoes_servico',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    servicoId: uuid('servico_id')
      .notNull()
      .references(() => servicos.id),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    /** Conta do Cliente na plataforma. Sempre vem da sessão, nunca do client. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Registro correspondente na carteira do prestador. */
    clienteCarteiraId: uuid('cliente_carteira_id').references(() => clientes.id),
    nomeServicoSnapshot: varchar('nome_servico_snapshot', {
      length: 160,
    }).notNull(),
    modeloPrecoSnapshot: varchar('modelo_preco_snapshot', {
      length: 20,
    }).notNull(),
    /** Nulo em `sob_orcamento`: não existe preço até haver proposta. */
    valorSnapshotCentavos: integer('valor_snapshot_centavos'),
    prazoEstimadoDias: integer('prazo_estimado_dias'),
    status: varchar('status', { length: 30 }).notNull().default('pendente'),
    observacoes: text('observacoes'),
    concluidoEm: timestamp('concluido_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    prestadorIdx: index('contratacoes_servico_prestador_idx').on(
      t.prestadorId,
      t.status,
    ),
    clienteIdx: index('contratacoes_servico_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    servicoIdx: index('contratacoes_servico_servico_idx').on(t.servicoId),
  }),
)
