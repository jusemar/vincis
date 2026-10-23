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
import { usuarios } from '../usuarios/tabela'

/**
 * Grupo de navegação do CMS: uma coluna do rodapé, hoje.
 *
 * `local` diz onde o grupo aparece: `rodape` (colunas planas de links) ou
 * `cabecalho` (menu, com um nível de submenu). Um lugar novo entra ampliando a
 * lista do `check` (e a do núcleo), sem recriar a tabela. O local é fixado na
 * criação: mudar um grupo de lugar poderia deixar agrupadores num rodapé, que
 * não os tem.
 *
 * `nome` é o rótulo interno da Gestão; `titulo_publico` é o que o visitante lê.
 * Nasce inativo: um grupo vazio não deve aparecer no site por acidente.
 */
export const cmsGruposNavegacao = pgTable(
  'cms_grupos_navegacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: varchar('nome', { length: 120 }).notNull(),
    tituloPublico: varchar('titulo_publico', { length: 120 }).notNull(),
    /** Chave estável para integrações e testes. Única. */
    identificador: varchar('identificador', { length: 120 }).notNull(),
    local: varchar('local', { length: 20 }).notNull().default('rodape'),
    ativo: boolean('ativo').notNull().default(false),
    ordem: integer('ordem').notNull().default(0),
    atualizadoPorId: uuid('atualizado_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    identificadorUnico: uniqueIndex('cms_grupos_navegacao_identificador_unique').on(
      t.identificador,
    ),
    localOrdemIdx: index('cms_grupos_navegacao_local_ordem_idx').on(t.local, t.ordem),
    localValido: check('cms_grupos_navegacao_local_valido', sql`${t.local} in ('rodape', 'cabecalho')`),
  }),
)
