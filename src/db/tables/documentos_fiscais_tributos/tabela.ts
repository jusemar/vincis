import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'
import { documentosFiscaisItens } from '../documentos_fiscais_itens/tabela'

/**
 * Tributos de um documento fiscal, por item ou do documento inteiro.
 *
 * ## Uma linha por tributo, não uma coluna por tributo
 *
 * `vICMS`, `vIPI`, `vPIS`, `vCOFINS` em colunas quebrariam a cada mudança de
 * norma — e a Reforma Tributária traz IBS, CBS e Imposto Seletivo convivendo
 * com os atuais por anos. Aqui cada incidência é uma linha, e o tributo é um
 * código (`icms`, `icms_st`, `ipi`, `pis`, `cofins`, `iss`, `ibs`, `cbs`,
 * `is`…). Tributo novo é código novo, sem migration. O vocabulário vive em
 * `features/documentos-fiscais/constants`; o banco só exige o formato.
 *
 * ## Estrutura comum + espaço controlado
 *
 * O que toda incidência tem ganha coluna e pode ser somado e filtrado: código
 * de situação (CST/CSOSN), classificação tributária (`cClassTrib` da Reforma),
 * base, alíquota, valor e se foi retido. O que é próprio de um tributo
 * (modalidade de base, MVA, redução, diferimento, crédito presumido) vai para
 * `dados_especificos`, cujo formato por tributo é validado pelo código que o
 * grava — não é JSON livre.
 *
 * `item_id` nulo é tributo do documento (totais, retenções da NFS-e). Com item,
 * a FK composta garante que item e tributo são da mesma extração.
 */
export const documentosFiscaisTributos = pgTable(
  'documentos_fiscais_tributos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extracaoId: uuid('extracao_id').notNull(),
    itemId: uuid('item_id'),
    tributo: varchar('tributo', { length: 30 }).notNull(),
    retido: boolean('retido').notNull().default(false),
    /** CST ou CSOSN, como informado. */
    codigoSituacao: varchar('codigo_situacao', { length: 4 }),
    classificacaoTributaria: varchar('classificacao_tributaria', { length: 10 }),
    baseCalculo: numeric('base_calculo', { precision: 15, scale: 2 }),
    /** Em pontos percentuais (18.0000 = 18%). */
    aliquotaPercentual: numeric('aliquota_percentual', { precision: 9, scale: 4 }),
    valor: numeric('valor', { precision: 15, scale: 2 }),
    dadosEspecificos: jsonb('dados_especificos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    extracaoFk: foreignKey({
      columns: [t.extracaoId],
      foreignColumns: [documentosFiscaisExtracoes.id],
      name: 'documentos_fiscais_tributos_extracao_fk',
    }).onDelete('cascade'),
    itemFk: foreignKey({
      columns: [t.itemId, t.extracaoId],
      foreignColumns: [documentosFiscaisItens.id, documentosFiscaisItens.extracaoId],
      name: 'documentos_fiscais_tributos_item_fk',
    }).onDelete('cascade'),
    // "Tributos desta extração", e totais por tributo.
    extracaoTributoIdx: index('documentos_fiscais_tributos_extracao_idx').on(
      t.extracaoId,
      t.tributo,
    ),
    itemIdx: index('documentos_fiscais_tributos_item_idx').on(t.itemId),
    tributoFormato: check(
      'documentos_fiscais_tributos_tributo_formato',
      sql`${t.tributo} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    baseNaoNegativa: check(
      'documentos_fiscais_tributos_base_nao_negativa',
      sql`coalesce(${t.baseCalculo}, 0) >= 0`,
    ),
    aliquotaNaoNegativa: check(
      'documentos_fiscais_tributos_aliquota_nao_negativa',
      sql`coalesce(${t.aliquotaPercentual}, 0) >= 0`,
    ),
  }),
)
