import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Os serviços avulsos que o cliente marca por cima do plano.
 *
 * O valor é mensal e entra pelo preço cheio: nenhum fator de ramo, atendimento
 * ou rotina incide sobre ele. Não é detalhe de implementação, é o que o
 * adicional é — uma reunião mensal custa o mesmo para a indústria e para o
 * prestador de serviços, e multiplicá-la pelo fator do ramo cobraria duas
 * vezes pela mesma característica da empresa.
 *
 * `disponivel_para_grupos` existe porque um adicional pode um dia valer só para
 * a rotina contábil. Hoje os quatro valem para as duas, e a coluna diz isso em
 * vez de deixar o motor supor.
 */
export const precificacaoAdicionais = pgTable(
  'precificacao_adicionais',
  {
    /** `emissao_extra`, `reuniao_mensal`, `suporte_prioritario`… */
    codigo: varchar('codigo', { length: 40 }).primaryKey(),
    rotulo: varchar('rotulo', { length: 120 }).notNull(),
    descricao: varchar('descricao', { length: 240 }).notNull(),
    valorMensalCentavos: integer('valor_mensal_centavos').notNull(),
    disponivelParaGrupos: varchar('disponivel_para_grupos', { length: 20 })
      .array()
      .notNull(),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    valorNaoNegativo: check(
      'precificacao_adicionais_valor_nao_negativo',
      sql`${t.valorMensalCentavos} >= 0`,
    ),
    gruposPreenchidos: check(
      'precificacao_adicionais_grupos_preenchidos',
      sql`cardinality(${t.disponivelParaGrupos}) >= 1
          and ${t.disponivelParaGrupos} <@ array['contabil', 'juridico']::varchar[]`,
    ),
  }),
)
