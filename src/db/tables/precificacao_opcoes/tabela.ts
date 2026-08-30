import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { precificacaoDimensoes } from '../precificacao_dimensoes/tabela'

/**
 * As respostas possíveis de cada pergunta do configurador.
 *
 * ## Nem toda opção mexe no preço por multiplicação
 *
 * `multiplicador_milesimos` é **nulo de propósito** no enquadramento e em quem
 * emite as notas: o regime escolhe qual linha de `precificacao_precos_base`
 * vale, e o emissor liga ou desliga a cobrança das faixas de nota. Gravar 1000
 * ("multiplica por 1") nessas linhas esconderia a diferença entre "esta opção
 * é neutra" e "esta opção não multiplica nada" — e o dia em que alguém
 * reajustasse o valor neutro por engano, o preço mudaria por um caminho que
 * ninguém procuraria.
 *
 * ## `padrao` é a resposta que o configurador já vem marcando
 *
 * Uma por dimensão, garantida por índice parcial único. Sem isso a tela abriria
 * com duas respostas marcadas na mesma pergunta ou com nenhuma.
 */
export const precificacaoOpcoes = pgTable(
  'precificacao_opcoes',
  {
    dimensaoCodigo: varchar('dimensao_codigo', { length: 30 })
      .notNull()
      .references(() => precificacaoDimensoes.codigo),
    /** Código estável dentro da dimensão: `simples`, `comercio`, `hibrido`… */
    codigo: varchar('codigo', { length: 30 }).notNull(),
    rotulo: varchar('rotulo', { length: 120 }).notNull(),
    /** Texto de apoio exibido abaixo do rótulo. Nulo quando não há. */
    ajuda: varchar('ajuda', { length: 240 }),
    /** Fator sobre o subtotal. 1080 = 1,080×. Nulo = não multiplica. */
    multiplicadorMilesimos: integer('multiplicador_milesimos'),
    padrao: boolean('padrao').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    opcaoUnica: uniqueIndex('precificacao_opcoes_dimensao_codigo').on(
      t.dimensaoCodigo,
      t.codigo,
    ),
    padraoUnico: uniqueIndex('precificacao_opcoes_padrao_unico')
      .on(t.dimensaoCodigo)
      .where(sql`${t.padrao}`),
    // Multiplicador zero zeraria o preço inteiro; negativo o inverteria. Os
    // dois passariam despercebidos numa tela de formulário.
    multiplicadorPositivo: check(
      'precificacao_opcoes_multiplicador_positivo',
      sql`${t.multiplicadorMilesimos} is null or ${t.multiplicadorMilesimos} > 0`,
    ),
  }),
)
