import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'
import { conhecimentoArtigoVersoes } from '../conhecimento_artigo_versoes/tabela'

/**
 * Artigo da Central de Conhecimento — a identidade estável do conteúdo.
 *
 * O texto não mora aqui: mora em `conhecimento_artigo_versoes`. O artigo só
 * aponta **qual versão está no ar** (`versao_publicada_id`). É isso que permite
 * revisar um artigo publicado sem trocar em silêncio o conteúdo aprovado: a
 * revisão é uma versão nova, em aberto, e o público continua vendo a versão
 * aprovada até a Vincis aprovar a nova.
 *
 * Autoria:
 * - `profissional`: `autor_id` é o prestador autenticado que criou o artigo;
 *   nome, foto, profissão e link do perfil são lidos do cadastro dele na hora
 *   de exibir — nunca de campo livre.
 * - `institucional`: escrito pela Gestão. `responsavel_editorial_id` é um
 *   Gestor (o próprio que criou) ou nulo, quando assinado só como "Vincis".
 *
 * Conteúdo global da plataforma (sem `empresa_id`), como `cms_paginas`. O
 * isolamento que importa aqui é por autor, e ele é aplicado em todas as
 * actions e queries de `features/conhecimento`.
 *
 * Não existe exclusão física: sair do ar é despublicar ou arquivar. O slug
 * vale para todos os status, para um link antigo nunca abrir outro conteúdo.
 */
export const conhecimentoArtigos = pgTable(
  'conhecimento_artigos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    /** `profissional` ou `institucional`. */
    tipoAutoria: varchar('tipo_autoria', { length: 20 }).notNull(),
    responsavelEditorialId: uuid('responsavel_editorial_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    /**
     * Endereço público (`/conhecimento/<slug>`). Acompanha o título enquanto o
     * artigo nunca foi publicado; na primeira publicação fica fixo.
     */
    slug: varchar('slug', { length: 160 }).notNull(),
    /** `nao_publicado`, `publicado`, `despublicado`, `arquivado`. */
    statusPublicacao: varchar('status_publicacao', { length: 20 }).notNull().default('nao_publicado'),
    versaoPublicadaId: uuid('versao_publicada_id').references(
      (): AnyPgColumn => conhecimentoArtigoVersoes.id,
      { onDelete: 'restrict' },
    ),
    destaque: boolean('destaque').notNull().default(false),
    /** Primeira publicação. Republicar não reescreve. */
    publicadoEm: timestamp('publicado_em'),
    /** Última versão aprovada que foi ao ar. */
    atualizadoPublicoEm: timestamp('atualizado_publico_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    slugUnico: uniqueIndex('conhecimento_artigos_slug_unique').on(t.slug),
    // Central pública: "publicados, mais recentes primeiro".
    publicacaoIdx: index('conhecimento_artigos_publicacao_idx').on(t.statusPublicacao, t.publicadoEm),
    // Painel do profissional e seção "Artigos deste profissional".
    autorIdx: index('conhecimento_artigos_autor_idx').on(t.autorId, t.statusPublicacao),
    tipoAutoriaValido: check(
      'conhecimento_artigos_tipo_autoria_valido',
      sql`${t.tipoAutoria} in ('profissional', 'institucional')`,
    ),
    statusPublicacaoValido: check(
      'conhecimento_artigos_status_publicacao_valido',
      sql`${t.statusPublicacao} in ('nao_publicado', 'publicado', 'despublicado', 'arquivado')`,
    ),
    // Publicado sempre aponta para uma versão aprovada.
    publicadoTemVersao: check(
      'conhecimento_artigos_publicado_tem_versao',
      sql`${t.statusPublicacao} <> 'publicado' or ${t.versaoPublicadaId} is not null`,
    ),
  }),
)
