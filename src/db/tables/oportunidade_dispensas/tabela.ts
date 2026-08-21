import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * "Não tenho interesse": o prestador tira a oportunidade da própria fila.
 *
 * Não é recusa comercial e não é cancelamento — não existe contratação para
 * recusar nesta etapa. É uma decisão **individual**: a solicitação continua
 * aberta, continua valendo para todos os outros prestadores compatíveis e o
 * Cliente não é avisado de nada. Por isso a informação vive numa tabela por
 * par (oportunidade, prestador), e não numa coluna de estado da oportunidade:
 * uma coluna só poderia contar a história de uma pessoa.
 *
 * Sem esta linha, a oportunidade voltaria a aparecer como pendente no próximo
 * F5 ou no próximo login — que é exatamente o que a ação existe para evitar.
 */
export const oportunidadeDispensas = pgTable(
  'oportunidade_dispensas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oportunidadeId: uuid('oportunidade_id')
      .notNull()
      .references(() => oportunidades.id, { onDelete: 'cascade' }),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * Uma dispensa por prestador em cada oportunidade.
     *
     * É o banco — e não o código da action — que impede o clique duplo de
     * gravar duas linhas para o mesmo par.
     */
    unicaPorPrestador: uniqueIndex('oportunidade_dispensas_unica').on(
      t.oportunidadeId,
      t.prestadorId,
    ),
    // "O que este prestador já dispensou?" é a pergunta da vitrine e do banner.
    prestadorIdx: index('oportunidade_dispensas_prestador_idx').on(
      t.prestadorId,
      t.createdAt,
    ),
  }),
)
