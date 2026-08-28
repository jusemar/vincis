import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Um card de "Casos de sucesso" do perfil público, editável pelo próprio
 * prestador.
 *
 * Sem tabela própria de aprovação: é vitrine, não cadastro regulamentado — o
 * profissional é o único autor e a única autorização exigida é ser o dono de
 * `prestador_id` (ver `salvarCasosSucesso`). `ordem` é a posição de exibição;
 * quem grava a lista inteira (delete + insert em transação, mesmo padrão de
 * `salvarDisponibilidades` da consultoria) é quem decide o valor, sempre
 * denso a partir de 0.
 */
export const perfilCasosSucesso = pgTable(
  'perfil_casos_sucesso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tipo: varchar('tipo', { length: 60 }).notNull(),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descricao: text('descricao').notNull(),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    prestadorIdx: index('perfil_casos_sucesso_prestador_idx').on(t.prestadorId, t.ordem),
  }),
)
