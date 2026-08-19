import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Arquivos anexados a um Atendimento.
 *
 * `chave` é o caminho do objeto no armazenamento privado (Vercel Blob, o mesmo
 * usado pelos comprovantes de registro profissional) — nunca um caminho do
 * disco local nem uma URL pública. O download passa por rota autorizada, que
 * confere o vínculo com o Atendimento antes de servir o conteúdo.
 *
 * `origem` diz de que lado veio o anexo (Cliente ou prestador) e `remetenteId`
 * diz quem exatamente enviou. Os dois juntos sustentam a auditoria do anexo.
 */
export const atendimentoArquivos = pgTable(
  'atendimento_arquivos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    tipoMime: varchar('tipo_mime', { length: 120 }).notNull(),
    tamanhoBytes: integer('tamanho_bytes').notNull(),
    origem: varchar('origem', { length: 20 }).notNull(),
    /**
     * Para que este arquivo existe no Atendimento.
     *
     * `anexo` é o documento que circula durante a execução — o comprovante que o
     * Cliente mandou, a minuta que a equipe subiu. `entrega_final` é o que foi
     * entregue **na conclusão**: o resultado do serviço.
     *
     * É coluna e não dedução por data porque a diferença é de natureza, não de
     * momento: um arquivo enviado no mesmo minuto da conclusão pode ser um anexo
     * qualquer, e um documento subido dias antes pode ser escolhido como a
     * entrega. Quem decide é quem conclui, e a decisão fica gravada.
     */
    finalidade: varchar('finalidade', { length: 20 })
      .notNull()
      .default('anexo'),
    remetenteId: uuid('remetente_id')
      .notNull()
      .references(() => usuarios.id),
    /** Caminho no armazenamento privado. Nunca exposto ao navegador. */
    chave: varchar('chave', { length: 500 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    atendimentoIdx: index('atendimento_arquivos_atendimento_idx').on(
      t.atendimentoId,
      t.createdAt,
    ),
    // "Quais são os arquivos de entrega deste Atendimento?" é a pergunta que o
    // portal do Cliente faz ao abrir um serviço concluído.
    finalidadeIdx: index('atendimento_arquivos_finalidade_idx').on(
      t.atendimentoId,
      t.finalidade,
    ),
  }),
)
