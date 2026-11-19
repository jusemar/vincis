import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Categoria da Central de Conhecimento (`/conhecimento`).
 *
 * Conteúdo global da plataforma — como as páginas do CMS —, por isso sem
 * `empresa_id`: quem cria e edita é só o Gestor da Vincis.
 *
 * `area_busca` liga a categoria a um filtro **real** da busca de profissionais
 * (`/profissionais?area=...`) para a chamada de conversão do artigo. Nula = a
 * chamada leva à busca sem filtro, sem inventar especialidade.
 *
 * Nada é excluído: categoria desativada some dos filtros públicos, mas os
 * artigos que já a usam continuam válidos.
 */
export const conhecimentoCategorias = pgTable(
  'conhecimento_categorias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: varchar('nome', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    descricao: varchar('descricao', { length: 300 }),
    /** `contabilidade`, `advocacia` ou nula (busca sem filtro). */
    areaBusca: varchar('area_busca', { length: 20 }),
    /** Frase da chamada para encontrar um profissional, exibida no artigo. */
    chamadaConversao: varchar('chamada_conversao', { length: 200 }),
    ativa: boolean('ativa').notNull().default(true),
    ordem: integer('ordem').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    slugUnico: uniqueIndex('conhecimento_categorias_slug_unique').on(t.slug),
    ativaOrdemIdx: index('conhecimento_categorias_ativa_ordem_idx').on(t.ativa, t.ordem),
    areaValida: check(
      'conhecimento_categorias_area_valida',
      sql`${t.areaBusca} is null or ${t.areaBusca} in ('contabilidade', 'advocacia')`,
    ),
  }),
)
