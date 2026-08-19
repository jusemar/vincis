import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Avaliação de um Atendimento concluído, feita pelo Cliente proprietário.
 *
 * Tabela própria, e não colunas no Atendimento, por três motivos que só
 * aparecem depois:
 *
 * - a avaliação é uma **camada posterior**: o Atendimento já terminou e não
 *   pode ser reescrito por causa dela (nem `updated_at`);
 * - ela pertence a duas pontas ao mesmo tempo — o Atendimento e o Prestador
 *   avaliado — e é pelo Prestador que a reputação pública é agregada, o que
 *   pede índice próprio;
 * - a reputação é sempre **calculada** a partir daqui. Não existe média
 *   guardada em lugar nenhum: um número persistido pode divergir das linhas
 *   que o originaram, e média divergente é pior do que média ausente.
 *
 * `prestador_id` é uma cópia deliberada de `atendimentos.prestador_id`: a
 * avaliação nasce apontando para quem foi avaliado naquele momento e continua
 * apontando para ele, mesmo que o Atendimento um dia mude de dono. Reputação
 * não se transfere junto com a carteira.
 */
export const avaliacoesAtendimento = pgTable(
  'avaliacoes_atendimento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    /** Prestador avaliado. É sempre o principal — participantes não herdam. */
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    /** Cliente proprietário do Atendimento. Ninguém mais pode escrever aqui. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** 1 a 5, inteiro. O CHECK abaixo é a última palavra sobre a faixa. */
    nota: integer('nota').notNull(),
    /** Opcional: estrelas sem texto é avaliação completa. */
    comentario: text('comentario'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * Uma avaliação por Atendimento e Prestador avaliado.
     *
     * É esta linha — e não o código da action — que impede o clique duplo e a
     * requisição repetida de virarem duas avaliações. A edição reaproveita o
     * mesmo registro justamente porque o banco não deixaria criar outro.
     */
    unicaPorAtendimento: uniqueIndex('avaliacoes_atendimento_unica').on(
      t.atendimentoId,
      t.prestadorId,
    ),
    /** A agregação pública é sempre "as avaliações deste Prestador". */
    prestadorIdx: index('avaliacoes_atendimento_prestador_idx').on(
      t.prestadorId,
      t.createdAt,
    ),
    clienteIdx: index('avaliacoes_atendimento_cliente_idx').on(
      t.clienteUsuarioId,
    ),
    // A faixa vive no banco, não só no Zod: nota 0, 6 ou 4.5 não entra nem por
    // migração, script de dados ou consulta escrita à mão.
    notaNaFaixa: check('avaliacoes_atendimento_nota_faixa', sql`${t.nota} between 1 and 5`),
  }),
)
