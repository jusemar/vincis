import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { documentosFiscaisEventos } from '../documentos_fiscais_eventos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * O arquivo original de um documento ou evento fiscal — a evidência.
 *
 * ## Imutável
 *
 * Só existe inserção. Reprocessar, corrigir, rodar OCR ou enriquecer por fonte
 * externa produz nova extração (`documentos_fiscais_extracoes`), nunca troca
 * este arquivo. Por isso não há `updated_at`, e o documento não pode ser
 * apagado fisicamente enquanto tiver arquivo (FK sem cascata).
 *
 * ## Armazenamento privado
 *
 * `chave_armazenamento` é o caminho do objeto no armazenamento privado — o
 * mesmo princípio de `atendimento_arquivos.chave`: nunca URL pública nem
 * caminho de disco. O download passará por rota que confere a autorização.
 *
 * ## Isolamento e duplicidade
 *
 * `empresa_id` repete a do documento e é amarrada a ela por FK composta: um
 * arquivo não aponta para documento de outro escritório. Com ela, "este
 * arquivo já foi enviado aqui?" é uma consulta por `(empresa_id, sha256)` sem
 * junção. É detecção, não unicidade: a mesma NF-e é evidência legítima de dois
 * clientes do mesmo escritório.
 */
export const documentosFiscaisArquivos = pgTable(
  'documentos_fiscais_arquivos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id').notNull(),
    documentoFiscalId: uuid('documento_fiscal_id').notNull(),
    /** Preenchido quando o arquivo é o XML de um evento do documento. */
    eventoFiscalId: uuid('evento_fiscal_id'),
    /** `xml`, `pdf` ou `imagem`. */
    tipoArquivo: varchar('tipo_arquivo', { length: 20 }).notNull(),
    nomeOriginal: varchar('nome_original', { length: 255 }).notNull(),
    tipoMime: varchar('tipo_mime', { length: 120 }).notNull(),
    tamanhoBytes: integer('tamanho_bytes').notNull(),
    /** Caminho no armazenamento privado. Nunca exposto ao navegador. */
    chaveArmazenamento: varchar('chave_armazenamento', { length: 500 }).notNull(),
    /** SHA-256 do conteúdo exato recebido, em hexadecimal minúsculo. */
    sha256: varchar('sha256', { length: 64 }).notNull(),
    enviadoPorId: uuid('enviado_por_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    documentoFk: foreignKey({
      columns: [t.documentoFiscalId, t.empresaId],
      foreignColumns: [documentosFiscais.id, documentosFiscais.empresaId],
      name: 'documentos_fiscais_arquivos_documento_fk',
    }),
    eventoFk: foreignKey({
      columns: [t.eventoFiscalId, t.documentoFiscalId],
      foreignColumns: [documentosFiscaisEventos.id, documentosFiscaisEventos.documentoFiscalId],
      name: 'documentos_fiscais_arquivos_evento_fk',
    }),
    enviadoPorFk: foreignKey({
      columns: [t.enviadoPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_arquivos_enviado_por_fk',
    }).onDelete('set null'),
    chaveArmazenamentoUnica: unique('documentos_fiscais_arquivos_chave_unica').on(
      t.chaveArmazenamento,
    ),
    // Alvo da FK composta da extração: a extração lê arquivo do próprio documento.
    idDocumentoUnico: unique('documentos_fiscais_arquivos_id_documento_unico').on(
      t.id,
      t.documentoFiscalId,
    ),
    empresaHashIdx: index('documentos_fiscais_arquivos_empresa_hash_idx').on(
      t.empresaId,
      t.sha256,
    ),
    documentoIdx: index('documentos_fiscais_arquivos_documento_idx').on(
      t.documentoFiscalId,
      t.createdAt,
    ),
    tipoValido: check(
      'documentos_fiscais_arquivos_tipo_valido',
      sql`${t.tipoArquivo} in ('xml', 'pdf', 'imagem')`,
    ),
    tamanhoPositivo: check(
      'documentos_fiscais_arquivos_tamanho_positivo',
      sql`${t.tamanhoBytes} > 0`,
    ),
    sha256Formato: check(
      'documentos_fiscais_arquivos_sha256_formato',
      sql`${t.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
  }),
)
