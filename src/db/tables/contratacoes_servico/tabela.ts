import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { cobrancasPix } from '../cobrancas_pix/tabela'
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
    /**
     * A cobrança Pix que pagou esta contratação.
     *
     * Única: o webhook repetido, a reconciliação e o polling do navegador
     * podem todos tentar efetivar o mesmo pagamento, e o banco deixa nascer
     * uma contratação só. Nulo nas contratações anteriores ao pagamento real.
     */
    cobrancaId: uuid('cobranca_id').references(() => cobrancasPix.id),
    /**
     * Retrato da comissão da Vincis vigente quando o Pix foi emitido.
     *
     * O Cliente paga o valor do catálogo à Vincis; a Vincis retém
     * `comissao_vincis_centavos` e o restante (`valor_profissional_centavos`)
     * pertence ao profissional. O percentual vem da configuração da Gestão e é
     * congelado aqui: mudar a configuração amanhã não reescreve contratação
     * antiga. Não tem relação com a comissão do parceiro indicador.
     *
     * Nulos nas contratações anteriores a esta regra (sem retrato) — nunca
     * recalculados com o percentual de hoje.
     */
    comissaoVincisMilesimos: integer('comissao_vincis_milesimos'),
    comissaoVincisCentavos: integer('comissao_vincis_centavos'),
    valorProfissionalCentavos: integer('valor_profissional_centavos'),
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
    cobrancaUnica: uniqueIndex('contratacoes_servico_cobranca_unica')
      .on(t.cobrancaId)
      .where(sql`cobranca_id is not null`),
    // Retrato inteiro ou nenhum, e as partes fecham o valor pago.
    comissaoCoerente: check(
      'contratacoes_servico_comissao_coerente',
      sql`(${t.comissaoVincisMilesimos} is null and ${t.comissaoVincisCentavos} is null and ${t.valorProfissionalCentavos} is null)
        or (${t.comissaoVincisMilesimos} between 1 and 999
          and ${t.comissaoVincisCentavos} >= 0
          and ${t.valorProfissionalCentavos} >= 0
          and ${t.comissaoVincisCentavos} + ${t.valorProfissionalCentavos} = ${t.valorSnapshotCentavos})`,
    ),
  }),
)
