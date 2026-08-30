import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Os acréscimos que dependem de quantidade: funcionários, notas fiscais e
 * faturamento.
 *
 * ## O intervalo é fechado no início e aberto no fim
 *
 * `limite_min` entra na faixa, `limite_max` não — `[min, max)`. Escrito assim,
 * as faixas de uma mesma família encaixam sem buraco e sem sobreposição
 * (`[0,11)`, `[11,31)`, `[31,101)`…), e nenhuma quantidade fica sem resposta.
 * A forma como o cliente lê a faixa ("Até 10", "11 a 30") é `rotulo`, e não se
 * confunde com o limite que o motor compara. `limite_max` nulo é a última
 * faixa, a que não tem teto.
 *
 * A unidade de `limite_min`/`limite_max` é a da família: **quantidade** em
 * funcionários e notas, **centavos** em faturamento. É a mesma coluna porque a
 * comparação é a mesma; quem lê sabe o que está contando pelo `tipo`.
 *
 * ## `por_unidade` é o que traduz "R$ 24 por funcionário acima de 2"
 *
 * `fixo` cobra `valor_centavos` uma vez quando a quantidade cai na faixa.
 * `por_unidade` cobra por unidade **dentro** da faixa — com `[3, ∞)` e 2400,
 * uma empresa de 5 funcionários paga 3 × R$ 24. É por isso que os dois
 * primeiros funcionários saem de graça sem existir nenhum campo "isentos": a
 * isenção é o início da faixa.
 *
 * ## `emissor_exigido` guarda a única condicional de preço da grade
 *
 * A faixa de notas fiscais só é cobrada quando quem emite é a Vincis. A
 * condição fica na faixa, e não no motor, para que o Gestor possa um dia
 * liberar uma faixa da regra sem que isso vire uma alteração de código.
 */
export const precificacaoFaixas = pgTable(
  'precificacao_faixas',
  {
    /** `contabil` ou `juridico`. */
    grupo: varchar('grupo', { length: 20 }).notNull(),
    /** `funcionarios`, `notas_fiscais` ou `faturamento`. */
    tipo: varchar('tipo', { length: 30 }).notNull(),
    /** Código estável dentro do par grupo+tipo: `ate10`, `excedente`… */
    codigo: varchar('codigo', { length: 30 }).notNull(),
    rotulo: varchar('rotulo', { length: 120 }).notNull(),
    /** Início do intervalo, inclusivo. */
    limiteMin: integer('limite_min').notNull().default(0),
    /** Fim do intervalo, exclusivo. Nulo na última faixa. */
    limiteMax: integer('limite_max'),
    valorCentavos: integer('valor_centavos').notNull(),
    /** `fixo` ou `por_unidade`. */
    modo: varchar('modo', { length: 20 }).notNull().default('fixo'),
    /** Só cobra se o emissor das notas for este. Nulo = cobra sempre. */
    emissorExigido: varchar('emissor_exigido', { length: 30 }),
    padrao: boolean('padrao').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    faixaUnica: uniqueIndex('precificacao_faixas_grupo_tipo_codigo').on(
      t.grupo,
      t.tipo,
      t.codigo,
    ),
    // O motor lê uma família inteira por vez e escolhe pela ordem.
    familiaIdx: index('precificacao_faixas_familia_idx').on(
      t.grupo,
      t.tipo,
      t.ordem,
    ),
    padraoUnico: uniqueIndex('precificacao_faixas_padrao_unico')
      .on(t.grupo, t.tipo)
      .where(sql`${t.padrao}`),
    tipoConhecido: check(
      'precificacao_faixas_tipo_conhecido',
      sql`${t.tipo} in ('funcionarios', 'notas_fiscais', 'faturamento')`,
    ),
    grupoConhecido: check(
      'precificacao_faixas_grupo_conhecido',
      sql`${t.grupo} in ('contabil', 'juridico')`,
    ),
    modoConhecido: check(
      'precificacao_faixas_modo_conhecido',
      sql`${t.modo} in ('fixo', 'por_unidade')`,
    ),
    // Faixa invertida não é erro de digitação: é uma faixa que nunca casa, e
    // some do cálculo sem nenhum sintoma.
    intervaloValido: check(
      'precificacao_faixas_intervalo_valido',
      sql`${t.limiteMin} >= 0 and (${t.limiteMax} is null or ${t.limiteMax} > ${t.limiteMin})`,
    ),
    valorNaoNegativo: check(
      'precificacao_faixas_valor_nao_negativo',
      sql`${t.valorCentavos} >= 0`,
    ),
  }),
)
