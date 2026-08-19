import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentoArquivos } from '../atendimento_arquivos/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Manifestações do Protocolo — o registro formal do Atendimento.
 *
 * Tabela própria, e não um `escopo` a mais em `atendimento_mensagens`, porque
 * as regras são diferentes: o chat é conversa direta entre quem está na sala,
 * enquanto o Protocolo é a solicitação formal do Cliente e as respostas que ela
 * recebe — com visibilidade assimétrica. Forçar as duas coisas na mesma tabela
 * faria a consulta do chat carregar a regra do Protocolo, e vice-versa.
 *
 * O Protocolo **não tem numeração própria**: ele é identificado pelo protocolo
 * do próprio Atendimento (`#AAAA-NNNN`).
 *
 * `visibilidade` é a autoridade sobre quem lê cada linha, gravada na criação a
 * partir do papel de quem escreveu:
 *
 * - `participantes_e_cliente`: manifestação do Cliente — todo mundo com acesso
 *   ao Atendimento precisa vê-la para poder responder;
 * - `autor_e_cliente`: resposta de um participante — chega ao Cliente e fica
 *   visível só para quem a escreveu. Um participante não enxerga a resposta que
 *   outro deu ao mesmo Cliente.
 *
 * A coluna existe em vez de recalcular a regra a cada consulta para que uma
 * mudança futura de política seja um valor novo, e não uma regra reescrita em
 * vários lugares.
 */
export const atendimentoManifestacoes = pgTable(
  'atendimento_manifestacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id')
      .notNull()
      .references(() => atendimentos.id, { onDelete: 'cascade' }),
    autorId: uuid('autor_id')
      .notNull()
      .references(() => usuarios.id),
    /** `cliente` ou `participante` — o papel de quem escreveu, no momento. */
    papelAutor: varchar('papel_autor', { length: 20 }).notNull(),
    conteudo: text('conteudo').notNull(),
    visibilidade: varchar('visibilidade', { length: 30 })
      .notNull()
      .default('autor_e_cliente'),
    /**
     * Manifestação à qual esta responde.
     *
     * A thread é linear de propósito: serve para dar contexto ("isto responde
     * àquilo"), não para aninhar níveis. Nada na interface desenha árvore.
     */
    respondeManifestacaoId: uuid('responde_manifestacao_id').references(
      (): AnyPgColumn => atendimentoManifestacoes.id,
    ),
    /** Arquivo já existente em `atendimento_arquivos`, quando citado. */
    arquivoId: uuid('arquivo_id').references(() => atendimentoArquivos.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    protocoloIdx: index('atendimento_manifestacoes_protocolo_idx').on(
      t.atendimentoId,
      t.createdAt,
    ),
    autorIdx: index('atendimento_manifestacoes_autor_idx').on(t.autorId),
  }),
)
