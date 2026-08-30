import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * As perguntas de escolha do configurador de `/precos`.
 *
 * Cada linha é uma pergunta — "Enquadramento fiscal", "Ramo da empresa" — e as
 * respostas possíveis vivem em `precificacao_opcoes`. A pergunta existe
 * separada da resposta por causa de `aplica_a_grupos`: "o ramo da empresa não
 * altera o preço do Jurídico" é um fato da **pergunta**, e repeti-lo em cada
 * uma das três opções de ramo criaria três chances de a regra divergir de si
 * mesma no dia em que alguém editasse só uma.
 *
 * As perguntas numéricas (funcionários, notas fiscais, faturamento) não estão
 * aqui: elas não têm lista de opções, têm faixas — `precificacao_faixas`.
 */
export const precificacaoDimensoes = pgTable(
  'precificacao_dimensoes',
  {
    /** `regime`, `atividade`, `emissor`, `atendimento`, `rotina`. */
    codigo: varchar('codigo', { length: 30 }).primaryKey(),
    /** Rótulo do campo no configurador. */
    rotulo: varchar('rotulo', { length: 120 }).notNull(),
    /** Grupos de preço em que a resposta muda alguma coisa. Nunca vazio. */
    aplicaAGrupos: varchar('aplica_a_grupos', { length: 20 })
      .array()
      .notNull(),
    /** `unica` ou `multipla` — quantas respostas o configurador aceita. */
    selecao: varchar('selecao', { length: 20 }).notNull().default('unica'),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    selecaoConhecida: check(
      'precificacao_dimensoes_selecao_conhecida',
      sql`${t.selecao} in ('unica', 'multipla')`,
    ),
    // Uma pergunta que não vale para grupo nenhum não é uma pergunta: seria um
    // campo na tela sem efeito no preço.
    gruposPreenchidos: check(
      'precificacao_dimensoes_grupos_preenchidos',
      sql`cardinality(${t.aplicaAGrupos}) >= 1
          and ${t.aplicaAGrupos} <@ array['contabil', 'juridico']::varchar[]`,
    ),
  }),
)
