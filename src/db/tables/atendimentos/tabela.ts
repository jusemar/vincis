import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { contratacoesServico } from '../contratacoes_servico/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Atendimento: o trabalho contratado sendo executado.
 *
 * É a peça operacional do Kanban e não se confunde com as duas vizinhas:
 * `servicos` é o catálogo que o prestador oferece e `contratacoes_servico` é o
 * ato comercial do Cliente. O Atendimento é o que a equipe toca todo dia —
 * status, prazo, responsável, arquivos e histórico.
 *
 * `contratacao_id` é único: uma contratação tem no máximo um Atendimento
 * operacional. Reabrir ou reprocessar a contratação reaproveita o mesmo
 * registro em vez de criar outro. É nulo de propósito para o Atendimento que um
 * dia nascer fora de uma contratação (aberto pelo próprio prestador).
 */
export const atendimentos = pgTable(
  'atendimentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Ano de criação do protocolo. Congelado no momento da criação. */
    protocoloAno: integer('protocolo_ano').notNull(),
    /** Sequência dentro do ano, servida por `atendimentos_sequencia_protocolo`. */
    protocoloSequencia: integer('protocolo_sequencia').notNull(),
    /**
     * Protocolo exibido (`#AAAA-NNNN`).
     *
     * Coluna gerada pelo banco: ninguém consegue reescrevê-la depois da
     * criação, nem por UPDATE direto. A imutabilidade fica garantida pelo
     * PostgreSQL e não pela disciplina do código de aplicação.
     */
    protocolo: varchar('protocolo', { length: 12 })
      .generatedAlwaysAs(
        sql`('#' || protocolo_ano::text || '-' || lpad(protocolo_sequencia::text, 4, '0'))`,
      )
      .notNull(),
    contratacaoId: uuid('contratacao_id').references(
      () => contratacoesServico.id,
    ),
    /** Prestador dono do Atendimento — a fronteira de isolamento da carteira. */
    prestadorId: uuid('prestador_id')
      .notNull()
      .references(() => usuarios.id),
    /** Responsável atual. Os demais integrantes vivem em participantes. */
    responsavelId: uuid('responsavel_id')
      .notNull()
      .references(() => usuarios.id),
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    clienteCarteiraId: uuid('cliente_carteira_id').references(() => clientes.id),
    empresaId: uuid('empresa_id').references(() => empresas.id),
    titulo: varchar('titulo', { length: 160 }).notNull(),
    categoria: varchar('categoria', { length: 30 }).notNull(),
    /** Status operacional do Kanban. Nasce em `novo`. */
    status: varchar('status', { length: 30 }).notNull().default('novo'),
    prioridade: varchar('prioridade', { length: 10 }).notNull().default('media'),
    acesso: varchar('acesso', { length: 20 }).notNull().default('privado'),
    /** Prazo real, quando a contratação traz um. Nulo quando não existe. */
    prazoEm: timestamp('prazo_em'),
    /**
     * Quando o Atendimento foi concluído, e por quem.
     *
     * Colunas próprias, e não uma leitura do histórico: "concluído em" e
     * "concluído por" são atributos do Atendimento, consultados pelo portal do
     * Cliente e por qualquer relatório futuro. Deduzi-los varrendo eventos
     * significaria refazer a mesma varredura em todo lugar — e depender de o
     * evento nunca mudar de texto.
     *
     * Nulos enquanto o serviço está em execução. O par com `status` é
     * intencionalmente redundante e essa redundância é a trava: a conclusão
     * grava os três de uma vez, num UPDATE condicionado, e é isso que impede
     * duas conclusões simultâneas de se sobreporem.
     */
    concluidoEm: timestamp('concluido_em'),
    concluidoPor: uuid('concluido_por').references(() => usuarios.id),
    /**
     * Observação final do profissional, escrita no momento da conclusão.
     *
     * Fica no Atendimento porque é dado da conclusão, e não uma mensagem a mais:
     * ela precisa sobreviver a qualquer limpeza de conversa e ser lida pelo
     * portal do Cliente sem depender de encontrar a linha certa do Protocolo.
     * O Protocolo recebe uma cópia como manifestação formal — lá é comunicação,
     * aqui é o registro.
     */
    observacaoFinal: text('observacao_final'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    protocoloUnico: uniqueIndex('atendimentos_protocolo_unico').on(t.protocolo),
    // Segunda linha de defesa: mesmo que a sequência falhasse, o par
    // (ano, sequência) não pode repetir.
    sequenciaUnica: uniqueIndex('atendimentos_protocolo_sequencia_unico').on(
      t.protocoloAno,
      t.protocoloSequencia,
    ),
    // Garante "no máximo um Atendimento por contratação" no próprio banco.
    contratacaoUnica: uniqueIndex('atendimentos_contratacao_unico').on(
      t.contratacaoId,
    ),
    prestadorIdx: index('atendimentos_prestador_idx').on(
      t.prestadorId,
      t.status,
    ),
    clienteIdx: index('atendimentos_cliente_idx').on(t.clienteUsuarioId),
  }),
)

/**
 * Sequência de protocolo por ano.
 *
 * Uma linha por ano, incrementada com `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING`. A operação é atômica e trava a linha do ano: dois
 * Atendimentos criados ao mesmo tempo recebem números diferentes. Contar
 * registros existentes (`max(sequencia) + 1`) daria empate sob concorrência, e
 * contar no navegador seria pior ainda.
 */
export const atendimentosSequenciaProtocolo = pgTable(
  'atendimentos_sequencia_protocolo',
  {
    ano: integer('ano').primaryKey(),
    ultimoNumero: integer('ultimo_numero').notNull().default(0),
  },
)
