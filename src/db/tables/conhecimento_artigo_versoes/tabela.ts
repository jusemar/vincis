import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigos } from '../conhecimento_artigos/tabela'
import { conhecimentoCategorias } from '../conhecimento_categorias/tabela'

/** Fonte ou referência citada pelo autor. URL opcional (lei impressa, livro). */
export type FonteArtigo = { titulo: string; url: string | null }

/**
 * Uma versão do texto de um artigo.
 *
 * Ciclo de uma versão:
 *   rascunho → aguardando_aprovacao → aprovada
 *                                   → devolvida → (autor corrige) → aguardando_aprovacao
 *                                   → rejeitada (fim)
 *   rascunho/devolvida → descartada (o autor desistiu da revisão)
 *
 * No máximo **uma** versão em aberto (rascunho, aguardando ou devolvida) por
 * artigo — índice único parcial abaixo. Versão aprovada é imutável: editar um
 * artigo publicado cria uma versão nova a partir dela.
 *
 * `conteudo` é a árvore JSON do editor, validada contra a lista fechada de nós
 * de `features/conhecimento/lib/conteudo-artigo` na gravação **e** na leitura
 * pública. Nunca HTML.
 */
export const conhecimentoArtigoVersoes = pgTable(
  'conhecimento_artigo_versoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artigoId: uuid('artigo_id')
      .notNull()
      .references((): AnyPgColumn => conhecimentoArtigos.id, { onDelete: 'restrict' }),
    numero: integer('numero').notNull(),
    status: varchar('status', { length: 30 }).notNull().default('rascunho'),
    titulo: varchar('titulo', { length: 180 }).notNull(),
    resumo: varchar('resumo', { length: 320 }).notNull().default(''),
    conteudo: jsonb('conteudo').$type<Record<string, unknown>>().notNull(),
    categoriaId: uuid('categoria_id').references(() => conhecimentoCategorias.id, {
      onDelete: 'restrict',
    }),
    capaUrl: text('capa_url'),
    capaAlt: varchar('capa_alt', { length: 180 }),
    fontes: jsonb('fontes').$type<FonteArtigo[]>().notNull().default([]),
    /**
     * Palavras-chave do autor: organização editorial e busca interna da
     * Central. Não viram `<meta name="keywords">` (ignorada pelo Google).
     * Versionadas com o texto: a revisão de um publicado pode trocá-las.
     */
    palavrasChave: text('palavras_chave').array().notNull().default([]),
    tituloSeo: varchar('titulo_seo', { length: 180 }),
    descricaoSeo: varchar('descricao_seo', { length: 320 }),
    /** Orientação da Vincis ao devolver ou rejeitar — o autor lê no painel. */
    observacaoModeracao: text('observacao_moderacao'),
    criadaPorId: uuid('criada_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    enviadaEm: timestamp('enviada_em'),
    decididaEm: timestamp('decidida_em'),
    decididaPorId: uuid('decidida_por_id').references(() => usuarios.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    numeroUnico: uniqueIndex('conhecimento_versoes_artigo_numero_unique').on(t.artigoId, t.numero),
    umaEmAberto: uniqueIndex('conhecimento_versoes_uma_em_aberto')
      .on(t.artigoId)
      .where(sql`${t.status} in ('rascunho', 'aguardando_aprovacao', 'devolvida')`),
    // Fila de moderação: "aguardando, mais antigas primeiro".
    filaIdx: index('conhecimento_versoes_fila_idx').on(t.status, t.enviadaEm),
    categoriaIdx: index('conhecimento_versoes_categoria_idx').on(t.categoriaId),
    statusValido: check(
      'conhecimento_versoes_status_valido',
      sql`${t.status} in ('rascunho', 'aguardando_aprovacao', 'devolvida', 'rejeitada', 'aprovada', 'descartada')`,
    ),
  }),
)
