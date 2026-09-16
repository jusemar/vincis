import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscais } from '../documentos_fiscais/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Eventos fiscais de um documento: autorização, cancelamento, carta de
 * correção, manifestações do destinatário e os que vierem.
 *
 * ## Por que tabela própria
 *
 * O XML de evento carrega a mesma chave de acesso da nota. Se evento fosse
 * linha de `documentos_fiscais`, a unicidade da chave impediria guardar o
 * cancelamento de uma nota já registrada. Aqui ele é filho do documento, e a
 * unicidade é do evento: tipo + código oficial + sequência — a CC-e pode ter
 * várias, numeradas; cancelamento, uma.
 *
 * Evento que chega antes da nota se liga a um documento ainda `pendente` com a
 * chave conhecida; quando a nota chega, completa a mesma linha.
 *
 * `codigo_evento` é o código oficial (ex.: `110111`); `tipo` é o vocabulário da
 * Vincis, estável entre documentos diferentes. `dados_especificos` guarda o que
 * é próprio de cada evento (justificativa, texto da correção) — nunca o XML.
 * O arquivo do evento, quando existir, é um `documentos_fiscais_arquivos` com
 * `evento_fiscal_id`.
 *
 * Fato registrado não é editado: não há `updated_at`.
 */
export const documentosFiscaisEventos = pgTable(
  'documentos_fiscais_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentoFiscalId: uuid('documento_fiscal_id').notNull(),
    tipo: varchar('tipo', { length: 40 }).notNull(),
    codigoEvento: varchar('codigo_evento', { length: 10 }),
    sequencia: integer('sequencia').notNull().default(1),
    protocolo: varchar('protocolo', { length: 30 }),
    /** Instante do evento na autoridade fiscal. */
    ocorridoEm: timestamp('ocorrido_em'),
    origem: varchar('origem', { length: 30 }).notNull(),
    registradoPorId: uuid('registrado_por_id'),
    dadosEspecificos: jsonb('dados_especificos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    documentoFk: foreignKey({
      columns: [t.documentoFiscalId],
      foreignColumns: [documentosFiscais.id],
      name: 'documentos_fiscais_eventos_documento_fk',
    }),
    registradoPorFk: foreignKey({
      columns: [t.registradoPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_eventos_registrado_por_fk',
    }).onDelete('set null'),
    // Alvo da FK composta do arquivo: arquivo de evento pertence ao mesmo documento.
    idDocumentoUnico: unique('documentos_fiscais_eventos_id_documento_unico').on(
      t.id,
      t.documentoFiscalId,
    ),
    // O mesmo evento não entra duas vezes. Também atende "eventos do documento".
    eventoUnico: uniqueIndex('documentos_fiscais_eventos_unico').on(
      t.documentoFiscalId,
      t.tipo,
      sql`coalesce(${t.codigoEvento}, '')`,
      t.sequencia,
    ),
    tipoValido: check(
      'documentos_fiscais_eventos_tipo_valido',
      sql`${t.tipo} in ('autorizacao', 'denegacao', 'cancelamento', 'carta_correcao',
        'ciencia_operacao', 'confirmacao_recebimento', 'desconhecimento_operacao',
        'operacao_nao_realizada', 'outro')`,
    ),
    origemValida: check(
      'documentos_fiscais_eventos_origem_valida',
      sql`${t.origem} in ('envio_usuario', 'captura_automatica', 'integracao')`,
    ),
    sequenciaPositiva: check(
      'documentos_fiscais_eventos_sequencia_positiva',
      sql`${t.sequencia} >= 1`,
    ),
  }),
)
