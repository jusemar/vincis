import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Até onde cada pessoa leu cada conversa.
 *
 * A leitura é **por pessoa**, e não uma coluna `lido` na mensagem: a mesma
 * mensagem já foi lida pela Ana e continua não lida para o Ricardo. Uma flag na
 * mensagem só conseguiria representar uma dessas duas verdades.
 *
 * O registro é uma marca-d'água (`lido_ate`) e não uma linha por mensagem lida.
 * Conversa é cronológica: quem leu a mensagem das 14h leu todas as anteriores,
 * então guardar o instante responde a mesma pergunta que N×M linhas
 * responderiam — sem crescer com o produto de mensagens por participante.
 * `ultima_mensagem_lida_id` fica ao lado como âncora explícita da mensagem em
 * que a leitura parou, para o dia em que a tela precisar apontar para ela.
 *
 * `escopo` + `recurso_id` permitem que a mesma tabela sirva a conversa do
 * Atendimento e a negociação privada do convite, que são conversas com regras
 * de acesso diferentes mas o mesmo problema de leitura. `canal` separa Cliente
 * de Interno dentro do mesmo Atendimento.
 */
export const atendimentoLeituras = pgTable(
  'atendimento_leituras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /** `atendimento` (conversa) ou `convite` (negociação privada). */
    escopo: varchar('escopo', { length: 20 }).notNull(),
    /**
     * Id do Atendimento ou do convite.
     *
     * Sem chave estrangeira de propósito: a coluna aponta para duas tabelas
     * diferentes conforme o escopo. A limpeza acompanha a remoção do recurso —
     * e uma marca órfã não concede acesso nenhum, ela só diz uma data.
     */
    recursoId: uuid('recurso_id').notNull(),
    /** `cliente`, `interno` ou `negociacao`. */
    canal: varchar('canal', { length: 20 }).notNull(),
    ultimaMensagemLidaId: uuid('ultima_mensagem_lida_id'),
    lidoAte: timestamp('lido_ate').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma marca por pessoa, por conversa, por canal. O `onConflictDoUpdate` da
    // gravação depende deste índice para ser atômico.
    unico: uniqueIndex('atendimento_leituras_unico').on(
      t.usuarioId,
      t.escopo,
      t.recursoId,
      t.canal,
    ),
    porUsuarioIdx: index('atendimento_leituras_usuario_idx').on(
      t.usuarioId,
      t.escopo,
    ),
  }),
)
