import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * A conta que também indica.
 *
 * ## Por que uma tabela, e não um perfil
 *
 * "Parceiro" é capacidade somada, como `ehGestor` — não é uma sexta persona.
 * Representá-lo em `perfis`/`usuarios_perfis` mudaria o `perfilOperacional` da
 * conta e, com ele, `resolverAcessoUsuario`: destino de login, `areasPermitidas`
 * e middleware passariam a responder diferente para quem só quis um link de
 * indicação. Uma tabela própria, ligada por `usuario_id`, acrescenta a
 * capacidade sem tocar em nenhuma das regras que decidem o que a pessoa é.
 *
 * Não confundir com `cliente_atribuicoes`: aquela é a carteira do escritório —
 * qual profissional atende qual cliente — e pertence a outro domínio.
 *
 * ## Um parceiro por conta
 *
 * `usuario_id` é único: é o banco, e não a Server Action, que garante a
 * idempotência da ativação. Dois cliques simultâneos no botão fazem dois
 * inserts, e o segundo esbarra aqui em vez de criar um segundo parceiro com um
 * segundo link.
 *
 * ## O código
 *
 * Identificador público, gerado no servidor, estável para sempre — é o que vai
 * no link que a pessoa compartilha, e um link compartilhado não pode mudar de
 * significado depois. Não é o `id`: expor a chave primária contaria quantos
 * parceiros existem e permitiria adivinhar vizinhos. Único no banco pelo mesmo
 * motivo que `usuario_id` é: duas contas com o mesmo código seriam duas donas
 * da mesma indicação.
 *
 * ## `on delete cascade`
 *
 * `excluir-usuario-seguro.ts` apaga a conta removendo, uma a uma, as tabelas
 * que conhece. Uma FK sem cascata faria toda exclusão de conta de parceiro
 * falhar — e falhar dentro de um `catch` que devolve "não foi possível". Como
 * nesta fase o parceiro é inteiramente derivado da conta (sem lead, atribuição
 * ou comissão pendurados), sumir junto é o comportamento correto e o que evita
 * mexer naquele fluxo. Quando existir histórico referenciando `parceiros.id`,
 * essa decisão precisa ser retomada: ali a exclusão passa a destruir registro
 * de terceiros, e a política tem de ser explícita.
 */
export const parceiros = pgTable('parceiros', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .unique()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  /** Identificador público do link. Ver `lib/codigo-do-parceiro`. */
  codigo: varchar('codigo', { length: 16 }).notNull().unique(),
  /** Quando a pessoa ativou. Automático: não existe aprovação manual. */
  ativadoEm: timestamp('ativado_em').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
