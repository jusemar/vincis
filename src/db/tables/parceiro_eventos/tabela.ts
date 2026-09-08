import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { parceiroIndicacoes } from '../parceiro_indicacoes/tabela'

/**
 * O histórico do ciclo de indicação.
 *
 * ## Por que não um contador
 *
 * O painel do parceiro precisa contar uma história — "acessou pelo link,
 * cadastrou-se, demonstrou interesse, a atribuição foi substituída" —, e uma
 * coluna `visitas int` só responde à primeira linha dela. Aqui cada fato vira
 * uma linha, com a hora em que aconteceu, e a leitura é a ordem cronológica.
 *
 * ## Só o que aconteceu
 *
 * Hoje existe **um** tipo: `acessou_link`. Os demais — cadastro, interesse,
 * contratação, expiração — entram quando as fatias que os produzem existirem.
 * Gravar agora um evento que ninguém viveu encheria o histórico de ficção, e o
 * histórico é justamente o que o parceiro vai usar para conferir o próprio
 * trabalho.
 *
 * Crescer é acrescentar um valor a `TIPOS_EVENTO_INDICACAO` e um `case` na
 * tradução para a tela: `tipo` é texto e `dados` é `jsonb`, então nenhum tipo
 * novo pede migração de estrutura. `jsonb` e não colunas porque cada tipo
 * futuro carrega uma carga diferente — o serviço no interesse, o parceiro que
 * substituiu na substituição —, e uma coluna por tipo deixaria a tabela cheia
 * de nulos.
 *
 * Append-only por decisão: nada aqui é editado ou apagado depois. É o que
 * torna o histórico confiável quando ele começar a lastrear comissão.
 */
export const parceiroEventos = pgTable(
  'parceiro_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    indicacaoId: uuid('indicacao_id')
      .notNull()
      .references(() => parceiroIndicacoes.id, { onDelete: 'cascade' }),
    /** Ver `TIPOS_EVENTO_INDICACAO`. Hoje só `acessou_link`. */
    tipo: varchar('tipo', { length: 30 }).notNull(),
    /** Carga própria do tipo. Nula quando o fato já se explica sozinho. */
    dados: jsonb('dados'),
    ocorridoEm: timestamp('ocorrido_em').defaultNow().notNull(),
  },
  (t) => ({
    doCicloIdx: index('parceiro_eventos_ciclo_idx').on(t.indicacaoId, t.ocorridoEm),
  }),
)
