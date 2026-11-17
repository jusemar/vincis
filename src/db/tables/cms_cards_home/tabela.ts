import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { cmsPaginas } from '../cms_paginas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Cards de serviço da página inicial, administrados pelo CMS.
 *
 * Conteúdo institucional global da Vincis (como `cms_paginas`): não pertence a
 * uma empresa, por isso não tem `empresa_id`. Só o Gestor da Plataforma escreve.
 *
 * - `estilo`: chave de um visual pronto no código — nunca classe CSS digitada.
 * - Destino: `pagina` (página do CMS, pela chave) ou `rota` (rota interna de
 *   uma lista fechada). O `check` garante que só um dos dois esteja preenchido.
 *   A página é `restrict`: o CMS nunca apaga página (arquiva), e um card não
 *   deve perder o destino em silêncio.
 * - `ordem`: o primeiro card ativo é o destacado na Home.
 * - `excluido_em`: exclusão lógica. O registro fica para a auditoria explicar o
 *   que saiu do site; não aparece mais na Gestão nem na Home.
 * - Nasce inativo: um card novo só vai ao ar quando o Gestor decide.
 */
export const cmsCardsHome = pgTable(
  'cms_cards_home',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    selo: varchar('selo', { length: 40 }),
    titulo: varchar('titulo', { length: 80 }).notNull(),
    descricao: varchar('descricao', { length: 240 }).notNull(),
    textoBotao: varchar('texto_botao', { length: 40 }).notNull(),
    estilo: varchar('estilo', { length: 20 }).notNull(),
    destinoTipo: varchar('destino_tipo', { length: 10 }).notNull(),
    paginaId: uuid('pagina_id').references(() => cmsPaginas.id, { onDelete: 'restrict' }),
    rota: varchar('rota', { length: 120 }),
    ativo: boolean('ativo').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    excluidoEm: timestamp('excluido_em'),
    atualizadoPorId: uuid('atualizado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    vitrineIdx: index('cms_cards_home_vitrine_idx').on(t.excluidoEm, t.ativo, t.ordem),
    paginaIdx: index('cms_cards_home_pagina_idx').on(t.paginaId),
    estiloValido: check(
      'cms_cards_home_estilo_valido',
      sql`${t.estilo} in ('destaque', 'esmeralda', 'ambar')`,
    ),
    destinoValido: check(
      'cms_cards_home_destino_valido',
      sql`(${t.destinoTipo} = 'pagina' and ${t.paginaId} is not null and ${t.rota} is null) or (${t.destinoTipo} = 'rota' and ${t.rota} is not null and ${t.paginaId} is null)`,
    ),
  }),
)
