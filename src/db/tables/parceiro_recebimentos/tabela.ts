import { pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { parceiros } from '../parceiros/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Para onde a Vincis paga o que deve a um parceiro.
 *
 * ## Tabela própria, e não colunas em `parceiros`
 *
 * Três razões, todas práticas. É dado pessoal com regra de acesso diferente do
 * resto do cadastro — dono e Gestor, mais ninguém —, e mantê-lo isolado é o que
 * permite tratá-lo à parte no dia em que houver cifragem em repouso. É opcional:
 * `parceiros` continua respondendo "quem é parceiro" sem carregar quatro colunas
 * nulas para quem nunca cadastrou chave. E é o começo de uma lista: conta
 * bancária/TED entra como outro `metodo`, sem esta tabela mudar de forma.
 *
 * ## Um método por parceiro
 *
 * O índice único em `parceiro_id` é a garantia. Editar é sobrescrever a linha,
 * não empilhar versões: a Vincis paga para **um** destino, e guardar histórico
 * de chaves aqui seria guardar dado pessoal antigo sem ninguém para consumi-lo.
 * O que precisa de histórico é o saque, e ele guarda o próprio retrato.
 *
 * ## O que esta linha não é
 *
 * Não é prova de titularidade. A plataforma não consulta o arranjo de pagamentos
 * e não tem como afirmar que a chave pertence ao titular informado — quem
 * confere é o parceiro, e o pagamento é conferido de novo pelo Gestor na hora de
 * transferir.
 */
export const parceiroRecebimentos = pgTable(
  'parceiro_recebimentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    /** `pix` hoje. Existe para conta bancária entrar depois sem migração. */
    metodo: varchar('metodo', { length: 20 }).notNull().default('pix'),
    /** `cpf`, `cnpj`, `email`, `telefone` ou `aleatoria`. */
    tipoChave: varchar('tipo_chave', { length: 20 }).notNull(),
    /** Guardada normalizada: documento e telefone só com dígitos. */
    chave: varchar('chave', { length: 140 }).notNull(),
    /** Nome de quem recebe. Pode diferir do nome da conta Vincis. */
    titular: varchar('titular', { length: 120 }).notNull(),
    /** Quem gravou por último. Sempre o próprio parceiro, pela sessão. */
    atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    porParceiroUnico: uniqueIndex('parceiro_recebimentos_parceiro_unico').on(
      t.parceiroId,
    ),
  }),
)
