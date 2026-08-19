import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Notificação: um aviso dirigido a uma pessoa.
 *
 * Não se confunde com `atendimento_eventos`, e por isso é outra tabela. O
 * evento é o registro permanente do que aconteceu **no Atendimento** — existe
 * uma vez, é o mesmo para todo mundo e não tem dono. A notificação é o aviso de
 * que aquilo **exige a atenção de alguém**: existe uma por destinatário, tem
 * estado de leitura próprio e desaparece da fila quando resolvida.
 *
 * Um mesmo fato de domínio pode gerar um evento e várias notificações — uma
 * mensagem no Atendimento avisa os três participantes e não avisa quem
 * escreveu. Guardar as duas coisas na mesma tabela obrigaria a inventar um
 * "evento por pessoa" e a duplicar o histórico.
 *
 * `destino` guarda para onde o clique leva, em partes: a tela não monta URL
 * adivinhando o formato. E o destino é só uma rota — quem autoriza o acesso ao
 * recurso continua sendo a consulta do recurso, não esta linha.
 */
export const notificacoes = pgTable(
  'notificacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    destinatarioId: uuid('destinatario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /** Quem provocou o aviso. Nulo quando a origem é o próprio sistema. */
    autorId: uuid('autor_id').references(() => usuarios.id),
    tipo: varchar('tipo', { length: 40 }).notNull(),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    resumo: varchar('resumo', { length: 240 }).notNull(),
    /** `atendimento` ou `convite` — o que o aviso referencia. */
    recursoTipo: varchar('recurso_tipo', { length: 20 }).notNull(),
    recursoId: uuid('recurso_id').notNull(),
    /**
     * Atendimento envolvido, quando existe.
     *
     * Fica ao lado de `recurso_id` porque o convite também pertence a um
     * Atendimento: é o que permite listar "tudo do protocolo #2026-0003" sem
     * resolver o recurso antes.
     */
    atendimentoId: uuid('atendimento_id').references(() => atendimentos.id, {
      onDelete: 'cascade',
    }),
    /**
     * Protocolo em texto, congelado na criação.
     *
     * Cópia deliberada: o aviso precisa continuar legível mesmo depois de o
     * Atendimento sair do alcance da pessoa, e ler o protocolo na hora de
     * exibir a lista revelaria a existência de um recurso que ela talvez não
     * possa mais abrir.
     */
    protocolo: varchar('protocolo', { length: 12 }),
    destino: jsonb('destino').notNull(),
    lidaEm: timestamp('lida_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // A consulta do sino é sempre "as minhas, mais recentes primeiro", com o
    // não lidas filtradas por cima.
    caixaIdx: index('notificacoes_caixa_idx').on(
      t.destinatarioId,
      t.lidaEm,
      t.createdAt,
    ),
    recursoIdx: index('notificacoes_recurso_idx').on(
      t.recursoTipo,
      t.recursoId,
    ),
  }),
)
