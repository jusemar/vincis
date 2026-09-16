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
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { documentosFiscaisArquivos } from '../documentos_fiscais_arquivos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Uma leitura de um documento fiscal, com a sua proveniência.
 *
 * ## Por que existe desde a fundação
 *
 * Partes, itens e tributos não pertencem ao documento diretamente: pertencem à
 * extração que os produziu. Assim "o que está no XML", "o que o OCR leu" e "o
 * que o usuário corrigiu" nunca se misturam na mesma linha:
 *
 * - `parser_xml` — leitura interna do XML original;
 * - `ocr` e `ia` — leitura de PDF/imagem, com `confianca`;
 * - `manual` — revisão do usuário (`criada_por_id`), que é uma nova extração
 *   sobre a anterior, e não uma edição dela.
 *
 * Reprocessar com parser novo também é extração nova. A anterior fica, com os
 * seus dados derivados, e deixa de ser `vigente`. Um documento tem no máximo uma
 * extração vigente — garantia do índice único parcial —, e é dela que sai o
 * cabeçalho de `documentos_fiscais`.
 *
 * `provedor` identifica quem leu (`vincis` para o parser interno) e `versao` a
 * versão dele. `dados` é o resultado bruto de OCR/IA quando não couber nas
 * tabelas; `erros`, códigos e caminhos do problema. Nenhum dos dois guarda o
 * XML integral.
 */
export const documentosFiscaisExtracoes = pgTable(
  'documentos_fiscais_extracoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentoFiscalId: uuid('documento_fiscal_id').notNull(),
    /** O arquivo lido. Nulo na extração `manual`. */
    arquivoId: uuid('arquivo_id'),
    metodo: varchar('metodo', { length: 20 }).notNull(),
    provedor: varchar('provedor', { length: 60 }).notNull(),
    versao: varchar('versao', { length: 40 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('processando'),
    vigente: boolean('vigente').notNull().default(false),
    /** 0 a 1. Nulo quando a leitura é determinística (XML, manual). */
    confianca: numeric('confianca', { precision: 5, scale: 4 }),
    dados: jsonb('dados'),
    erros: jsonb('erros'),
    criadaPorId: uuid('criada_por_id'),
    iniciadaEm: timestamp('iniciada_em').defaultNow().notNull(),
    /** Fim da leitura, com sucesso ou falha. */
    finalizadaEm: timestamp('finalizada_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    documentoFk: foreignKey({
      columns: [t.documentoFiscalId],
      foreignColumns: [documentosFiscais.id],
      name: 'documentos_fiscais_extracoes_documento_fk',
    }).onDelete('cascade'),
    arquivoFk: foreignKey({
      columns: [t.arquivoId, t.documentoFiscalId],
      foreignColumns: [documentosFiscaisArquivos.id, documentosFiscaisArquivos.documentoFiscalId],
      name: 'documentos_fiscais_extracoes_arquivo_fk',
    }),
    criadaPorFk: foreignKey({
      columns: [t.criadaPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_extracoes_criada_por_fk',
    }).onDelete('set null'),
    vigenteUnica: uniqueIndex('documentos_fiscais_extracoes_vigente_unica')
      .on(t.documentoFiscalId)
      .where(sql`${t.vigente}`),
    // Histórico de leituras do documento.
    documentoIdx: index('documentos_fiscais_extracoes_documento_idx').on(
      t.documentoFiscalId,
      t.createdAt,
    ),
    metodoValido: check(
      'documentos_fiscais_extracoes_metodo_valido',
      sql`${t.metodo} in ('parser_xml', 'ocr', 'ia', 'manual')`,
    ),
    statusValido: check(
      'documentos_fiscais_extracoes_status_valido',
      sql`${t.status} in ('processando', 'concluida', 'falhou')`,
    ),
    // Só leitura concluída pode alimentar o documento.
    vigenteConcluida: check(
      'documentos_fiscais_extracoes_vigente_concluida',
      sql`not ${t.vigente} or ${t.status} = 'concluida'`,
    ),
    conclusaoCoerente: check(
      'documentos_fiscais_extracoes_conclusao_coerente',
      sql`(${t.status} = 'processando') = (${t.finalizadaEm} is null)`,
    ),
    confiancaValida: check(
      'documentos_fiscais_extracoes_confianca_valida',
      sql`${t.confianca} is null or (${t.confianca} >= 0 and ${t.confianca} <= 1)`,
    ),
    // Leitura de arquivo aponta o arquivo; revisão manual não lê arquivo.
    origemCoerente: check(
      'documentos_fiscais_extracoes_origem_coerente',
      sql`(${t.metodo} = 'manual') = (${t.arquivoId} is null)`,
    ),
  }),
)
