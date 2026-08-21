import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Anexos de uma solicitação de orçamento.
 *
 * Mesma arquitetura de `atendimento_arquivos`, de propósito: `chave` é o
 * caminho do objeto no armazenamento privado (Vercel Blob), nunca uma URL
 * pública nem um caminho de disco, e o download passa por rota autorizada que
 * confere o vínculo com a oportunidade antes de servir qualquer byte. A
 * política de tipo e tamanho é a mesma do resto da plataforma, importada de
 * `@/lib/anexos-privados` — não existe um segundo sistema de upload.
 *
 * Tabela própria (e não uma coluna no Atendimento ou reaproveitamento de
 * `atendimento_arquivos`) porque a oportunidade **não é** um Atendimento: ela
 * existe antes de haver prestador escolhido, e o `atendimento_id` obrigatório
 * daquela tabela não teria valor nenhum para preencher.
 */
export const oportunidadeArquivos = pgTable(
  'oportunidade_arquivos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oportunidadeId: uuid('oportunidade_id')
      .notNull()
      .references(() => oportunidades.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    tipoMime: varchar('tipo_mime', { length: 120 }).notNull(),
    tamanhoBytes: integer('tamanho_bytes').notNull(),
    /** Quem enviou. Nesta etapa é sempre o Cliente autor da solicitação. */
    remetenteId: uuid('remetente_id')
      .notNull()
      .references(() => usuarios.id),
    /** Caminho no armazenamento privado. Nunca exposto ao navegador. */
    chave: varchar('chave', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    oportunidadeIdx: index('oportunidade_arquivos_oportunidade_idx').on(
      t.oportunidadeId,
      t.createdAt,
    ),
  }),
)
