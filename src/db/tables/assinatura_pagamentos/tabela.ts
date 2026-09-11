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
import { assinaturas } from '../assinaturas/tabela'

/**
 * Dinheiro de uma assinatura da Vincis — a fonte de verdade financeira dela.
 *
 * ## Assinatura, competência, pagamento, comissão
 *
 * A assinatura é o contrato; a competência, o mês de prestação; esta linha, o
 * dinheiro. Nenhuma das três infere a outra: o contrato não vira pago por
 * existir, o mês não vira pago por passar, e o pagamento não vira mês prestado
 * por ter sido antecipado. Quais meses um pagamento cobre está em
 * `assinatura_pagamento_alocacoes`.
 *
 * ## Só `confirmado` produz efeito
 *
 * Criação, pendência e passagem do tempo não cobrem mês nenhum. Pagamentos
 * simulados de oportunidade e de consultoria não são lidos aqui, e nada daqui
 * os lê. `provedor` diz quem confirmou; hoje o único aceito é
 * `homologacao_manual`, técnico de propósito, e o provedor real entra por
 * migration quando existir.
 *
 * ## Identidade do evento
 *
 * O mesmo evento financeiro processado duas vezes esbarra num destes índices:
 * `(provedor, id_externo)` — o identificador do gateway — ou
 * `(provedor, chave_idempotencia)` — a chave de quem confirmou. Toda linha tem
 * ao menos um dos dois.
 *
 * ## Estorno no futuro
 *
 * `estornado` existe para que devolver dinheiro não exija apagar história: a
 * linha fica, as alocações ficam, e a cobertura dos meses — que só conta
 * pagamentos confirmados — deixa de existir. Estorno parcial e complemento
 * serão entidades próprias; nada aqui obriga um pagamento a cobrir o contrato
 * inteiro.
 */
export const assinaturaPagamentos = pgTable(
  'assinatura_pagamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Sem cascata: dinheiro não some porque o contrato sumiu. */
    assinaturaId: uuid('assinatura_id')
      .notNull()
      .references(() => assinaturas.id),
    /** Apurado no servidor a partir das competências. Nunca vindo da tela. */
    valorCentavos: integer('valor_centavos').notNull(),
    moeda: varchar('moeda', { length: 3 }).notNull().default('BRL'),
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    provedor: varchar('provedor', { length: 40 }).notNull(),
    /** O identificador do pagamento no gateway, quando houver gateway. */
    idExterno: varchar('id_externo', { length: 120 }),
    /** A chave de quem confirmou, quando não há identificador de gateway. */
    chaveIdempotencia: varchar('chave_idempotencia', { length: 120 }),
    confirmadoEm: timestamp('confirmado_em'),
    canceladoEm: timestamp('cancelado_em'),
    estornadoEm: timestamp('estornado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    porIdExternoUnico: uniqueIndex('assinatura_pagamentos_id_externo_unico')
      .on(t.provedor, t.idExterno)
      .where(sql`id_externo is not null`),
    porChaveUnica: uniqueIndex('assinatura_pagamentos_chave_unica')
      .on(t.provedor, t.chaveIdempotencia)
      .where(sql`chave_idempotencia is not null`),
    /*
      Alvo da chave estrangeira composta das alocações: é o que impede, no
      banco, que o pagamento de uma assinatura cubra o mês de outra.
    */
    idDaAssinaturaUnico: uniqueIndex('assinatura_pagamentos_id_assinatura_unico').on(
      t.id,
      t.assinaturaId,
    ),
    daAssinaturaIdx: index('assinatura_pagamentos_assinatura_idx').on(
      t.assinaturaId,
      t.createdAt,
    ),
    valorPositivo: check(
      'assinatura_pagamentos_valor_positivo',
      sql`${t.valorCentavos} > 0`,
    ),
    moedaValida: check('assinatura_pagamentos_moeda_valida', sql`${t.moeda} = 'BRL'`),
    provedorValido: check(
      'assinatura_pagamentos_provedor_valido',
      sql`${t.provedor} in ('homologacao_manual')`,
    ),
    identificado: check(
      'assinatura_pagamentos_identificado',
      sql`${t.idExterno} is not null or ${t.chaveIdempotencia} is not null`,
    ),
    /*
      Estado e carimbos andam juntos.

      Pendente não tem data nenhuma; confirmado tem a da confirmação; cancelado
      morreu sem ter sido confirmado; estornado foi confirmado antes de voltar.
    */
    statusCoerente: check(
      'assinatura_pagamentos_status_coerente',
      sql`(${t.status} = 'pendente' and ${t.confirmadoEm} is null
            and ${t.canceladoEm} is null and ${t.estornadoEm} is null)
        or (${t.status} = 'confirmado' and ${t.confirmadoEm} is not null
            and ${t.canceladoEm} is null and ${t.estornadoEm} is null)
        or (${t.status} = 'cancelado' and ${t.confirmadoEm} is null
            and ${t.canceladoEm} is not null and ${t.estornadoEm} is null)
        or (${t.status} = 'estornado' and ${t.confirmadoEm} is not null
            and ${t.canceladoEm} is null and ${t.estornadoEm} is not null)`,
    ),
  }),
)
