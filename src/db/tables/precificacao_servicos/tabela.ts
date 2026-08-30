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
 * Os tipos de serviço que a Vincis vende.
 *
 * ## Conceito fixo, preço variável
 *
 * As quatro linhas — Contabilidade Padrão, Contabilidade Consultiva,
 * Assistência Jurídica e Pacote Empresarial Completo — são vocabulário do
 * negócio, não cadastro. A tabela existe para que **preço, texto comercial e
 * regra** deixem de morar no código, e não para que alguém possa apagar a
 * Contabilidade Padrão numa tarde. Por isso não há e não deve haver caminho de
 * exclusão: `ativo = false` tira da vitrine sem destruir o conceito, do mesmo
 * jeito que `consultoria_configuracoes.ativa` faz com a agenda.
 *
 * ## Duas famílias de preço, não quatro
 *
 * `grupo_base` diz de qual tabela de preços-base o serviço parte
 * (`precificacao_precos_base`). Padrão e Consultiva partem do **mesmo** valor
 * contábil: a Consultiva é esse valor multiplicado por
 * `multiplicador_milesimos` (1350 = 1,350×). Gravar um preço próprio para a
 * Consultiva pareceria mais direto e seria pior — o Gestor teria de reajustar
 * duas grades de quatro regimes e mantê-las coerentes de cabeça.
 *
 * ## O Pacote é composição, não um quinto preço
 *
 * Ele não tem `grupo_base` nem multiplicador: `componentes` nomeia os serviços
 * somados (Consultiva + Jurídico) e o abatimento vive em
 * `precificacao_descontos`. É o que garante que reajustar a Consultiva reflita
 * no Pacote sem ninguém precisar lembrar de uma segunda tela.
 *
 * ## Unidades
 *
 * Toda esta família de tabelas usa duas: **centavos** para dinheiro (inteiro,
 * nunca ponto flutuante) e **milésimos** para fatores e percentuais (o número
 * real × 1000). Nenhuma coluna guarda fração.
 */
export const precificacaoServicos = pgTable(
  'precificacao_servicos',
  {
    /** `padrao`, `consultiva`, `juridico`, `combo`. Estável — é chave de negócio. */
    codigo: varchar('codigo', { length: 30 }).primaryKey(),
    nome: varchar('nome', { length: 80 }).notNull(),
    /** Texto comercial exibido no card de `/precos`. */
    chamada: varchar('chamada', { length: 400 }).notNull(),
    /** `contabil` ou `juridico`. Nulo apenas no serviço composto. */
    grupoBase: varchar('grupo_base', { length: 20 }),
    /** Fator sobre o preço-base do grupo. 1000 = 1,000×. Nulo no composto. */
    multiplicadorMilesimos: integer('multiplicador_milesimos'),
    /** Códigos dos serviços somados. Vazio em tudo que não é composto. */
    componentes: varchar('componentes', { length: 30 })
      .array()
      .notNull()
      .default([]),
    /** Destaque visual do card. Decisão comercial, não de layout. */
    destaque: boolean('destaque').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    grupoConhecido: check(
      'precificacao_servicos_grupo_conhecido',
      sql`${t.grupoBase} is null or ${t.grupoBase} in ('contabil', 'juridico')`,
    ),
    // Ou o serviço parte de um preço-base, ou ele é a soma de outros. Nunca as
    // duas coisas, nunca nenhuma das duas — um serviço sem origem de preço
    // seria uma linha que o motor não sabe calcular.
    origemDoPreco: check(
      'precificacao_servicos_origem_do_preco',
      sql`(${t.grupoBase} is not null and ${t.multiplicadorMilesimos} > 0 and cardinality(${t.componentes}) = 0)
          or (${t.grupoBase} is null and ${t.multiplicadorMilesimos} is null and cardinality(${t.componentes}) >= 2)`,
    ),
  }),
)
