import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'

/**
 * Itens de um documento fiscal — mercadoria ou serviço —, como lidos por uma
 * extração.
 *
 * As colunas são o que é comum a qualquer documento com itens: código,
 * descrição, classificações (NCM, CEST, CFOP para mercadoria; código de serviço
 * e NBS para serviço), quantidade e valores. O que é próprio de um leiaute
 * (rastreabilidade, combustível, veículo, medicamento) vai para
 * `dados_especificos`, sem migration a cada grupo novo.
 *
 * Classificações ficam como texto sem máscara e sem restrição de formato: são
 * códigos oficiais que mudam por norma, e a validação pertence ao parser.
 *
 * Precisão igual à do leiaute: quantidade com 4 casas, valor unitário com 10.
 */
export const documentosFiscaisItens = pgTable(
  'documentos_fiscais_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extracaoId: uuid('extracao_id').notNull(),
    /** Número do item no documento, a partir de 1. */
    numeroItem: integer('numero_item').notNull(),
    codigoProduto: varchar('codigo_produto', { length: 60 }),
    descricao: text('descricao'),
    gtin: varchar('gtin', { length: 14 }),
    ncm: varchar('ncm', { length: 8 }),
    cest: varchar('cest', { length: 7 }),
    cfop: varchar('cfop', { length: 4 }),
    /** Código do serviço (LC 116 / tributação nacional). */
    codigoServico: varchar('codigo_servico', { length: 20 }),
    nbs: varchar('nbs', { length: 12 }),
    unidade: varchar('unidade', { length: 10 }),
    quantidade: numeric('quantidade', { precision: 15, scale: 4 }),
    valorUnitario: numeric('valor_unitario', { precision: 21, scale: 10 }),
    valorBruto: numeric('valor_bruto', { precision: 15, scale: 2 }),
    valorDesconto: numeric('valor_desconto', { precision: 15, scale: 2 }),
    valorFrete: numeric('valor_frete', { precision: 15, scale: 2 }),
    valorSeguro: numeric('valor_seguro', { precision: 15, scale: 2 }),
    valorOutrasDespesas: numeric('valor_outras_despesas', { precision: 15, scale: 2 }),
    valorTotal: numeric('valor_total', { precision: 15, scale: 2 }),
    dadosEspecificos: jsonb('dados_especificos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    extracaoFk: foreignKey({
      columns: [t.extracaoId],
      foreignColumns: [documentosFiscaisExtracoes.id],
      name: 'documentos_fiscais_itens_extracao_fk',
    }).onDelete('cascade'),
    // Também atende "itens desta extração", em ordem.
    numeroUnico: unique('documentos_fiscais_itens_numero_unico').on(
      t.extracaoId,
      t.numeroItem,
    ),
    // Alvo da FK composta do tributo: tributo de item é da mesma extração.
    idExtracaoUnico: unique('documentos_fiscais_itens_id_extracao_unico').on(
      t.id,
      t.extracaoId,
    ),
    numeroPositivo: check(
      'documentos_fiscais_itens_numero_positivo',
      sql`${t.numeroItem} >= 1`,
    ),
    valoresNaoNegativos: check(
      'documentos_fiscais_itens_valores_nao_negativos',
      sql`coalesce(${t.quantidade}, 0) >= 0
        and coalesce(${t.valorUnitario}, 0) >= 0
        and coalesce(${t.valorBruto}, 0) >= 0
        and coalesce(${t.valorDesconto}, 0) >= 0
        and coalesce(${t.valorFrete}, 0) >= 0
        and coalesce(${t.valorSeguro}, 0) >= 0
        and coalesce(${t.valorOutrasDespesas}, 0) >= 0
        and coalesce(${t.valorTotal}, 0) >= 0`,
    ),
  }),
)
