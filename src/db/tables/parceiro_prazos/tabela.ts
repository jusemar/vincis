import { sql } from 'drizzle-orm'
import { check, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Prazo de atribuição por serviço, definido pela Gestão Vincis.
 *
 * ## Por que uma tabela, e não `configuracoes_plataforma`
 *
 * Aquele registro é chave-valor de **parâmetro global**: um número, um
 * significado. Prazo por serviço é uma linha por serviço, com limite próprio e
 * dono identificável — em chave-valor viraria `parceiro_prazo_contabilidade`,
 * `parceiro_prazo_advocacia`, sem restrição nenhuma no banco e sem lugar para
 * dizer quem mudou o quê. O padrão global continua lá, que é onde ele pertence.
 *
 * ## Por que a chave não é uma FK para `precificacao_servicos`
 *
 * Seria a escolha óbvia — é tabela real, com chave de negócio estável. Mas a
 * atribuição nasce de uma **oportunidade**, e oportunidade não aponta para um
 * dos quatro planos: ela tem `categoria` (`contabilidade` | `advocacia`). Uma
 * solicitação contábil corresponde tanto à Padrão quanto à Consultiva, e
 * escolher uma delas na hora de congelar o prazo seria inventar um mapeamento
 * que o produto não tem.
 *
 * Então a chave é o vocabulário que a atribuição de fato registra —
 * `CATEGORIAS_OPORTUNIDADE`, lista fechada e validada na escrita pela mesma
 * função que a oportunidade usa. Não é string livre: nada entra aqui sem passar
 * por `referenciaDePrazoValida`. Quando contratação direta e consultoria
 * entrarem, elas **sabem** qual serviço foi contratado, e aí os códigos de
 * `precificacao_servicos` passam a ser referências válidas também — o
 * vocabulário cresce sem a tabela mudar de forma.
 *
 * ## Mudança não é retroativa
 *
 * Nada aqui é lido depois que a atribuição nasce: o prazo vigente é copiado
 * para `parceiro_atribuicoes.prazo_dias` no instante do registro. Alterar uma
 * linha desta tabela vale só para o que vier depois — mesmo princípio de
 * `oportunidades.expira_em`, que congela o prazo global na publicação.
 */
export const parceiroPrazos = pgTable(
  'parceiro_prazos',
  {
    /** Serviço a que o prazo se aplica. Ver `REFERENCIAS_PRAZO`. */
    referencia: varchar('referencia', { length: 30 }).primaryKey(),
    /** Dias de validade da atribuição. Mínimo um — zero não é ausência. */
    dias: integer('dias').notNull(),
    /** Quem definiu por último. Auditoria detalhada fica em `eventos_auditoria`. */
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Prazo é tempo, e tempo começa em um. Zero significaria "sem janela", que
    // é uma decisão de produto diferente e precisaria de outro nome.
    diasPositivos: check(
      'parceiro_prazos_dias_positivos',
      sql`${t.dias} >= 1 and ${t.dias} <= 3650`,
    ),
  }),
)
