import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Configurações da plataforma, editáveis pela Gestão Vincis.
 *
 * Chave-valor de propósito: cada parâmetro tem um significado próprio e um
 * conversor próprio no domínio (`features/configuracoes/lib`), enquanto o
 * armazenamento é um só. Uma coluna por parâmetro exigiria migration a cada
 * decisão de produto — e é justamente uma decisão de produto que muda esses
 * valores, não uma mudança de modelo.
 *
 * O valor é texto porque é o menor denominador comum entre número, duração e
 * lista; quem lê converte e valida. `atualizado_por` existe para que uma
 * mudança de regra da plataforma tenha dono identificável.
 */
export const configuracoesPlataforma = pgTable('configuracoes_plataforma', {
  chave: varchar('chave', { length: 60 }).primaryKey(),
  valor: text('valor').notNull(),
  atualizadoPor: uuid('atualizado_por').references(() => usuarios.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
