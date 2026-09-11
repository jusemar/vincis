import { sql } from 'drizzle-orm'
import {
  check,
  date,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { assinaturas } from '../assinaturas/tabela'

/**
 * Um mês de prestação de um contrato da Vincis.
 *
 * ## Competência não é cobrança
 *
 * Esta linha diz "o contrato cobre este mês", e só isso. Não diz que houve
 * cobrança, nem pagamento, nem comissão. Um plano semestral pago de uma vez tem
 * seis competências e um só pagamento; um mensal tem uma competência por mês e
 * uma cobrança por mês. As duas coisas só coincidem às vezes, e por isso vivem
 * em entidades diferentes — o pagamento, quando existir, aponta para cá.
 *
 * ## É a unidade da comissão futura
 *
 * A comissão do parceiro é apropriada **mês a mês**, mesmo quando o cliente
 * pagou o semestre adiantado. Esta é a linha que a comissão recorrente vai
 * referenciar: identidade estável (`id`, e `assinatura_id` + `numero`), valor
 * congelado, estado de prestação. Se o contrato for cancelado no segundo mês, os
 * meses três a seis viram `cancelada` e não sustentam comissão nenhuma.
 *
 * ## Datas nascem nulas
 *
 * O contrato nasce aguardando pagamento, e o início real depende dele. Datar as
 * competências agora — a partir do dia do aceite — inventaria um início que o
 * pagamento vai deslocar, e deixaria duas datas para o mesmo mês. Por isso a
 * competência nasce com número e valor, e o período é preenchido quando a
 * vigência existir, por calendário de verdade (dia 31 de janeiro vira o último
 * dia de fevereiro, sem deriva nos meses seguintes).
 *
 * ## O valor é o do mês, congelado aqui
 *
 * Nos prazos fechados, é a parte daquele mês no total contratado, repartida sem
 * criar nem perder centavo. No mensal contínuo, é o mensal vigente quando o mês
 * é materializado — e é assim que um reajuste futuro entra: competências já
 * criadas não mudam; as próximas nascem com o preço novo.
 */
export const assinaturaCompetencias = pgTable(
  'assinatura_competencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Sem cascata: competência é histórico do contrato, não se apaga. */
    assinaturaId: uuid('assinatura_id')
      .notNull()
      .references(() => assinaturas.id),
    /** A posição do mês no contrato: 1, 2, 3… A identidade dele. */
    numero: integer('numero').notNull(),
    /** Primeiro dia do mês de prestação. Nulo até a vigência começar. */
    periodoInicio: date('periodo_inicio', { mode: 'string' }),
    /** Último dia do mês de prestação, inclusive. Nulo até a vigência começar. */
    periodoFim: date('periodo_fim', { mode: 'string' }),
    /** O valor deste mês, congelado. Base da comissão futura. */
    valorBaseCentavos: integer('valor_base_centavos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('prevista'),
    cumpridaEm: timestamp('cumprida_em'),
    canceladaEm: timestamp('cancelada_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /*
      Um contrato não tem o mesmo mês duas vezes.

      É a trava de reprocessar e da concorrência: gerar as competências de novo,
      ou duas vezes ao mesmo tempo, esbarra aqui e não cria a segunda linha.
    */
    porNumeroUnico: uniqueIndex('assinatura_competencias_numero_unico').on(
      t.assinaturaId,
      t.numero,
    ),
    /*
      E, depois de datado, também não tem dois meses começando no mesmo dia.
      Parcial porque antes da vigência as datas não existem.
    */
    porInicioUnico: uniqueIndex('assinatura_competencias_inicio_unico')
      .on(t.assinaturaId, t.periodoInicio)
      .where(sql`periodo_inicio is not null`),
    statusValido: check(
      'assinatura_competencias_status_valido',
      sql`${t.status} in ('prevista', 'em_andamento', 'cumprida', 'cancelada')`,
    ),
    numeroPositivo: check(
      'assinatura_competencias_numero_positivo',
      sql`${t.numero} > 0`,
    ),
    valorNaoNegativo: check(
      'assinatura_competencias_valor_nao_negativo',
      sql`${t.valorBaseCentavos} >= 0`,
    ),
    // Período inteiro ou nenhum, e nunca terminando antes de começar.
    periodoCoerente: check(
      'assinatura_competencias_periodo_coerente',
      sql`(${t.periodoInicio} is null and ${t.periodoFim} is null)
        or (${t.periodoInicio} is not null and ${t.periodoFim} is not null
            and ${t.periodoFim} >= ${t.periodoInicio})`,
    ),
    // O carimbo acompanha o estado: nem cancelada sem data, nem data sem cancelada.
    cancelamentoCoerente: check(
      'assinatura_competencias_cancelamento_coerente',
      sql`(${t.status} = 'cancelada') = (${t.canceladaEm} is not null)`,
    ),
    cumprimentoCoerente: check(
      'assinatura_competencias_cumprimento_coerente',
      sql`(${t.status} = 'cumprida') = (${t.cumpridaEm} is not null)`,
    ),
  }),
)
