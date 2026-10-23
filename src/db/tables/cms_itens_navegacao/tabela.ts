import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
import { cmsGruposNavegacao } from '../cms_grupos_navegacao/tabela'
import { cmsPaginas } from '../cms_paginas/tabela'

/**
 * Item de um grupo de navegação.
 *
 * Dois tipos, decididos pela página:
 *
 * - **link** (`pagina_id` preenchido): aponta para uma página do CMS. `texto`
 *   vazio usa o título da página.
 * - **agrupador** (`pagina_id` nulo): só abre um submenu. Não tem destino
 *   próprio, então `texto` é obrigatório (`check` abaixo).
 *
 * `pai_id` põe o item dentro do submenu de um agrupador. A hierarquia tem um
 * nível só e o pai é sempre agrupador do mesmo grupo — regras do núcleo
 * (`nucleo/lib/arvore-navegacao`), conferidas pela action; o banco garante o que
 * consegue sozinho: pai existente, nunca o próprio item, e nenhum pai apagado
 * com filhos pendurados (`restrict`).
 *
 * `ordem` vale entre irmãos: raízes do grupo entre si, filhos do mesmo pai
 * entre si. Desligar um item é `ativo = false`; remover é apagar só o vínculo
 * (a página nunca é apagada — é arquivada —, por isso `pagina_id` é `restrict`).
 *
 * URL externa continua fora, de propósito: entra como coluna opcional quando
 * for necessária, sem recriar a tabela.
 */
export const cmsItensNavegacao = pgTable(
  'cms_itens_navegacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    grupoId: uuid('grupo_id')
      .notNull()
      .references(() => cmsGruposNavegacao.id, { onDelete: 'cascade' }),
    paginaId: uuid('pagina_id').references(() => cmsPaginas.id, { onDelete: 'restrict' }),
    paiId: uuid('pai_id').references((): AnyPgColumn => cmsItensNavegacao.id, {
      onDelete: 'restrict',
    }),
    texto: varchar('texto', { length: 180 }),
    ordem: integer('ordem').notNull().default(0),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A mesma página não aparece duas vezes na mesma coluna.
    grupoPaginaUnico: uniqueIndex('cms_itens_navegacao_grupo_pagina_unique').on(
      t.grupoId,
      t.paginaId,
    ),
    grupoOrdemIdx: index('cms_itens_navegacao_grupo_ordem_idx').on(t.grupoId, t.ordem),
    paginaIdx: index('cms_itens_navegacao_pagina_idx').on(t.paginaId),
    paiIdx: index('cms_itens_navegacao_pai_idx').on(t.paiId, t.ordem),
    // Agrupador não tem página, então precisa de texto para existir na tela.
    destinoOuTexto: check(
      'cms_itens_navegacao_destino_ou_texto',
      sql`${t.paginaId} is not null or ${t.texto} is not null`,
    ),
    naoEhOProprioPai: check('cms_itens_navegacao_pai_diferente', sql`${t.paiId} <> ${t.id}`),
  }),
)
