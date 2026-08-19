import { sql } from 'drizzle-orm'
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentoArquivos } from '../atendimento_arquivos/tabela'
import { atendimentoEventos } from '../atendimento_eventos/tabela'
import { atendimentoManifestacoes } from '../atendimento_manifestacoes/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Solicitação de ajuste sobre um Atendimento já concluído.
 *
 * Tabela própria, e não colunas no Atendimento nem um Atendimento novo:
 *
 * - **não é outro Atendimento.** O protocolo é o mesmo, o Cliente é o mesmo e a
 *   entrega discutida é a mesma. Abrir um segundo registro quebraria o vínculo
 *   com a conclusão que está sendo questionada e duplicaria histórico, arquivos
 *   e conversa;
 * - **não são colunas do Atendimento.** A solicitação tem ciclo de vida próprio
 *   (nasce pendente, é analisada, é encerrada) e pode acontecer mais de uma vez
 *   ao longo da vida do mesmo Atendimento. Colunas guardariam só a última;
 * - **o estado daqui não é o status do Atendimento.** `pendente` não move o card
 *   de coluna nenhuma: o Atendimento continua `concluido` até que alguém
 *   autorizado decida reabri-lo.
 *
 * A referência ao arquivo é ao anexo que já existe em `atendimento_arquivos` —
 * o Cliente envia pelo mesmo caminho de sempre, com a mesma autorização e o
 * mesmo download protegido. Não há segundo sistema de upload.
 */
export const atendimentoAjustes = pgTable(
  'atendimento_ajustes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    /** Quem pediu. É sempre o Cliente proprietário — conferido no domínio. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** `pendente`, `aceita`, `recusada` ou `encerrada`. */
    status: varchar('status', { length: 20 }).notNull().default('pendente'),
    /** O que o Cliente descreveu. Obrigatório: pedido sem motivo não é pedido. */
    motivo: text('motivo').notNull(),
    /** Resposta formal de quem analisou. Obrigatória na recusa. */
    resposta: text('resposta'),
    /** Anexo opcional do Cliente, já gravado em `atendimento_arquivos`. */
    arquivoId: uuid('arquivo_id').references(() => atendimentoArquivos.id, {
      onDelete: 'set null',
    }),
    /**
     * A linha do Protocolo que registrou o pedido.
     *
     * A solicitação é uma manifestação formal, e não uma entidade paralela ao
     * registro do Atendimento: guardar o id aqui permite ir de uma à outra sem
     * procurar a manifestação pelo texto.
     */
    manifestacaoId: uuid('manifestacao_id').references(
      () => atendimentoManifestacoes.id,
      { onDelete: 'set null' },
    ),
    /** A manifestação da decisão (aceite ou recusa), quando já houve uma. */
    respostaManifestacaoId: uuid('resposta_manifestacao_id').references(
      () => atendimentoManifestacoes.id,
      { onDelete: 'set null' },
    ),
    analisadoPor: uuid('analisado_por').references(() => usuarios.id),
    analisadoEm: timestamp('analisado_em'),
    /**
     * O evento de reabertura que este pedido originou.
     *
     * Só existe quando a decisão foi aceitar. É o elo explícito entre "o Cliente
     * pediu" e "o Atendimento voltou a andar" — sem ele, a ligação entre os dois
     * fatos dependeria de comparar carimbos de tempo.
     */
    reaberturaEventoId: uuid('reabertura_evento_id').references(
      () => atendimentoEventos.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * No máximo **uma** solicitação pendente por Atendimento.
     *
     * Índice parcial, e não uma conferência no código: é ele que impede o clique
     * duplo, a requisição repetida e duas abas abertas de virarem dois pedidos
     * para o mesmo problema. Depois de analisada — aceita, recusada ou
     * encerrada — a linha sai do índice e um pedido futuro volta a ser possível.
     */
    umPendentePorAtendimento: uniqueIndex('atendimento_ajustes_pendente_unico')
      .on(t.atendimentoId)
      .where(sql`status = 'pendente'`),
    // "Quais são as solicitações deste Atendimento, da mais recente para a mais
    // antiga?" é a pergunta que o portal e o painel fazem ao abrir o registro.
    atendimentoIdx: index('atendimento_ajustes_atendimento_idx').on(
      t.atendimentoId,
      t.createdAt,
    ),
    clienteIdx: index('atendimento_ajustes_cliente_idx').on(t.clienteUsuarioId),
  }),
)
