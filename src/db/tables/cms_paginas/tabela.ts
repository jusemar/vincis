import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Página institucional do CMS.
 *
 * É conteúdo global da plataforma — sobre, termos, privacidade —, e não dado
 * de escritório: por isso não tem `empresa_id`. Quem escreve aqui é só o
 * Gestor, e a porta fica nas actions de `features/cms`.
 *
 * `conteudo` guarda o documento estruturado do editor (árvore JSON), nunca
 * HTML. A forma aceita é a lista fechada de `features/cms/nucleo/conteudo`,
 * validada na gravação e de novo na leitura pública.
 *
 * Não existe exclusão física: remover é arquivar. O slug de uma página
 * arquivada continua reservado — o índice único vale para todos os status —,
 * para que um link antigo nunca passe a abrir outro conteúdo.
 */
export const cmsPaginas = pgTable(
  'cms_paginas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titulo: varchar('titulo', { length: 180 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),
    conteudo: jsonb('conteudo').$type<Record<string, unknown>>().notNull(),
    /** `rascunho`, `publicada`, `arquivada`. */
    status: varchar('status', { length: 20 }).notNull().default('rascunho'),
    tituloSeo: varchar('titulo_seo', { length: 180 }),
    descricaoSeo: varchar('descricao_seo', { length: 320 }),
    /** Primeira publicação. Despublicar não apaga: a data conta a história. */
    publicadaEm: timestamp('publicada_em'),
    autorId: uuid('autor_id').references(() => usuarios.id, { onDelete: 'set null' }),
    atualizadoPorId: uuid('atualizado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    slugUnico: uniqueIndex('cms_paginas_slug_unique').on(t.slug),
    // A listagem da Gestão é sempre "deste status, mais recentes primeiro".
    statusIdx: index('cms_paginas_status_idx').on(t.status, t.updatedAt),
    statusValido: check(
      'cms_paginas_status_valido',
      sql`${t.status} in ('rascunho', 'publicada', 'arquivada')`,
    ),
  }),
)
