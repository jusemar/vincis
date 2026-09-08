import { sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { parceiros } from '../parceiros/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Um ciclo de indicação: este navegador chegou por este parceiro.
 *
 * ## Ciclo, não clique
 *
 * Uma linha não é uma visita — é o **período** em que um navegador está
 * associado a um parceiro. Cada acesso vira um evento em `parceiro_eventos`; a
 * linha nova só nasce quando o parceiro muda. Contar cliques numa tabela e
 * chamar isso de indicação obrigaria, mais tarde, a decidir qual dos vinte
 * cliques de Maria é "a" indicação dela.
 *
 * ## Último parceiro válido, sem apagar nada
 *
 * Quando o mesmo navegador chega pelo link de outra pessoa, o ciclo anterior é
 * **fechado** (`substituida_em` + `substituida_por_id`) e um novo é aberto. A
 * linha antiga permanece inteira, com os eventos dela: o histórico do primeiro
 * parceiro não desaparece porque um segundo apareceu, e a substituição fica
 * legível dos dois lados.
 *
 * O índice parcial abaixo é o que garante **um ciclo aberto por navegador**. É
 * garantia de banco, e não da rota: dois acessos simultâneos passariam os dois
 * pela mesma consulta antes de qualquer um gravar.
 *
 * Isto ainda **não** é atribuição comercial. Não há prazo por serviço, não há
 * janela de validade e não há comissão — só o fato técnico de por qual link o
 * navegador entrou por último.
 *
 * ## Visitante anônimo
 *
 * `visitante_hash` é o SHA-256 do identificador opaco guardado no cookie, pelo
 * mesmo motivo que `sessoes_usuario` guarda o hash do token: quem lê o banco
 * não fica de posse do valor que o navegador apresenta. O identificador não
 * carrega usuário, parceiro nem nada legível — é sorteio puro.
 *
 * Não há IP nesta tabela, e não deve haver: identificar visitante por IP é
 * exatamente o que a regra desta fase proíbe. `user_agent` e o **host** de
 * origem ficam para auditoria — saber se o acesso veio de um robô de
 * pré-visualização e de qual canal a pessoa veio —, e não para reconhecer
 * ninguém.
 *
 * ## `usuario_id`
 *
 * Nasce nulo e **nada escreve nele nesta fatia**. Existe para que a fatia
 * seguinte consiga comparar o momento da indicação (`created_at`) com o momento
 * de criação da conta e decidir se a pessoa já era da base antes do link —
 * regra já definida, ainda não implementada. `on delete set null` porque apagar
 * a conta não pode apagar o histórico do parceiro, que é de outra pessoa.
 */
export const parceiroIndicacoes = pgTable(
  'parceiro_indicacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    /** SHA-256 do identificador opaco do navegador. Nunca o valor cru. */
    visitanteHash: varchar('visitante_hash', { length: 64 }).notNull(),
    /** Por onde a indicação entrou. Ver `ORIGENS_INDICACAO`. */
    origem: varchar('origem', { length: 24 }).notNull().default('link_indicacao'),
    /** Truncado. Auditoria de robô, não identificação de pessoa. */
    userAgent: varchar('user_agent', { length: 255 }),
    /** Só o host do referenciador — nunca a URL inteira. */
    referenciaHost: varchar('referencia_host', { length: 120 }),
    /** Preenchido na fatia do cadastro. Nulo enquanto o visitante é anônimo. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    /** Quando deixou de ser o ciclo atual deste navegador. */
    substituidaEm: timestamp('substituida_em'),
    /** O ciclo que tomou o lugar deste. */
    substituidaPorId: uuid('substituida_por_id').references(
      (): AnyPgColumn => parceiroIndicacoes.id,
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A lista do parceiro é "as minhas, mais recentes primeiro".
    doParceiroIdx: index('parceiro_indicacoes_parceiro_idx').on(
      t.parceiroId,
      t.createdAt,
    ),
    // Um ciclo aberto por navegador — garantia do banco.
    cicloAbertoUnico: uniqueIndex('parceiro_indicacoes_ciclo_aberto_unico')
      .on(t.visitanteHash)
      .where(sql`substituida_em is null`),
  }),
)
