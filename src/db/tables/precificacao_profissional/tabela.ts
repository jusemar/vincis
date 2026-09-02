import { boolean, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * A tabela de preços que cada Profissional publica no próprio perfil.
 *
 * ## O que esta linha guarda, e o que ela deliberadamente não guarda
 *
 * Só o **estado de publicação**. Os valores ficam em
 * `precificacao_profissional_valores`, e a estrutura da grade — quais regimes
 * existem, onde cada faixa começa e termina, quais dimensões multiplicam o
 * preço — não é gravada em lugar nenhum aqui: ela é a da Vincis
 * (`precificacao_*`), lida a cada cálculo.
 *
 * Essa divisão é a decisão central do recurso. O Profissional escolhe **quanto
 * cobra**, nunca **como se cobra**: ele não cria faixa, não inventa dimensão e
 * não muda o limite de uma faixa. É o que permite reaproveitar o motor da
 * Vincis sem copiá-lo, e é o que garante que uma grade individual não possa
 * nascer incoerente — a estrutura que ela usa já passou pela validação de
 * `obterTabelaPrecificacao`.
 *
 * ## `publicado` não é redundante com "tem valores gravados"
 *
 * O Profissional pode ter um rascunho inteiro montado e ainda não querer
 * ninguém vendo. Esta coluna é a única resposta para "o perfil público mostra
 * planos e preços?" — e é ela que o cartão do perfil consulta, sem precisar
 * carregar valor nenhum.
 *
 * ## Nada disso encosta na precificação da Vincis
 *
 * As tabelas `precificacao_*` continuam sendo escritas apenas pelas actions do
 * Gestor. O Profissional escreve exclusivamente nestas duas tabelas novas, e
 * as duas são chaveadas pelo `usuario_id` dele.
 */
export const precificacaoProfissional = pgTable(
  'precificacao_profissional',
  {
    /** O prestador dono desta tabela de preços. Uma por conta. */
    profissionalId: uuid('profissional_id')
      .primaryKey()
      .references(() => usuarios.id),
    /** O perfil público exibe "Ver planos e preços"? */
    publicado: boolean('publicado').notNull().default(false),
    /** Quando a versão que está no ar foi publicada. Nulo enquanto nunca foi. */
    publicadoEm: timestamp('publicado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A vitrine e o perfil perguntam "quem publicou preço?"; sem o índice
    // parcial a resposta varre a tabela inteira de prestadores.
    publicadoIdx: index('precificacao_profissional_publicado_idx').on(
      t.publicado,
    ),
  }),
)
