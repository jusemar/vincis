import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Reserva temporária de um horário de consultoria.
 *
 * ## O que uma linha aqui significa — e o que não significa
 *
 * Significa: *este Cliente tem o direito de continuar a contratação deste
 * horário até `expira_em`*. Não significa consulta marcada, não significa
 * pagamento, não significa Atendimento e não significa protocolo. É o degrau
 * do meio de `disponibilidade → reserva → contratação confirmada`, e ele
 * caduca sozinho.
 *
 * ## Por que existe `status` num registro que já tem `expira_em`
 *
 * Porque o índice único não sabe que horas são. A exclusividade do horário
 * precisa ser cobrada pelo banco, e um índice parcial só pode filtrar por
 * coluna — `WHERE expira_em > now()` é impossível, porque `now()` não é
 * imutável. Então a passagem do tempo é **materializada**: ao disputar um
 * horário, a aquisição primeiro marca como `expirada` toda reserva daquela
 * consultoria cujo prazo já venceu, e só depois insere. O índice parcial sobre
 * `status = 'ativa'` passa a ser uma verdade que o banco consegue cobrar.
 *
 * Isso é higiene, não autoridade: a consulta de disponibilidade nunca confia
 * em `status` sozinho — ela exige `status = 'ativa' AND expira_em > now()`.
 * Uma reserva vencida que ninguém varreu ainda não bloqueia horário nenhum, e
 * é por isso que nada aqui depende de Cron.
 *
 * ## Por que o instante, e não a data local
 *
 * `inicio_em`/`fim_em` são instantes absolutos, como o resto da plataforma
 * grava tempo. Conflito de agenda é conflito na linha do tempo: guardar
 * "14:00" e o fuso obrigaria a comparação a reconstruir o instante de cada
 * linha antes de decidir se duas reservas se cruzam. O fuso continua junto —
 * mas para **exibir**, não para comparar.
 *
 * ## O que é congelado, e por quê
 *
 * `valor_centavos` e `duracao_minutos` são fotografia do momento da reserva. O
 * Profissional pode reajustar o preço enquanto o Cliente digita o cartão nos
 * dez minutos seguintes, e quem já reservou paga o que lhe foi mostrado. A
 * etapa de pagamento lerá daqui, do servidor — nunca do navegador.
 *
 * `descricao` é o assunto que o Cliente escreveu. Mora aqui porque precisava
 * sobreviver com segurança até o pagamento, e o navegador não é lugar para
 * isso. É dado privado do Cliente: a consulta pública de agenda não o
 * seleciona, e o Profissional só passa a vê-lo quando a contratação existir de
 * fato — como o `motivo` de uma exceção, que também nunca sai da mão do dono.
 */
export const consultoriaReservas = pgTable(
  'consultoria_reservas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * A dona da reserva é a consultoria.
     *
     * Mesmo motivo das faixas e das exceções: repetir `prestador_id` criaria
     * duas verdades sobre de quem é o horário. Quem precisa do Profissional
     * chega nele pela configuração.
     */
    configuracaoId: uuid('configuracao_id').notNull(),
    /** Sempre da sessão validada. Nenhum id de cliente é aceito da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id').notNull(),
    inicioEm: timestamp('inicio_em').notNull(),
    fimEm: timestamp('fim_em').notNull(),
    /** Depois deste instante a reserva não segura mais nada. */
    expiraEm: timestamp('expira_em').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('ativa'),
    /** Fotografia financeira do momento da reserva. */
    valorCentavos: integer('valor_centavos').notNull(),
    duracaoMinutos: integer('duracao_minutos').notNull(),
    /** Só para exibir a reserva no fuso da agenda. */
    timezone: varchar('timezone', { length: 64 }).notNull(),
    /** Privado do Cliente. Ver o cabeçalho. */
    descricao: varchar('descricao', { length: 1000 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    configuracaoFk: foreignKey({
      columns: [t.configuracaoId],
      foreignColumns: [consultoriaConfiguracoes.id],
      name: 'consultoria_reservas_configuracao_fk',
    }).onDelete('cascade'),
    clienteFk: foreignKey({
      columns: [t.clienteUsuarioId],
      foreignColumns: [usuarios.id],
      name: 'consultoria_reservas_cliente_fk',
    }),
    /**
     * A rede de segurança do banco para o caso grosseiro.
     *
     * Dois Clientes clicando no mesmo minuto do mesmo horário não conseguem
     * gravar os dois, mesmo que alguém um dia esqueça de travar a configuração
     * antes de inserir. A sobreposição *parcial* — 14:00–15:00 contra
     * 14:30–15:30 — é a que este índice não alcança, e por isso a aquisição
     * roda dentro de uma transação que serializa a agenda inteira.
     */
    horarioUnico: uniqueIndex('consultoria_reservas_horario_unico')
      .on(t.configuracaoId, t.inicioEm)
      .where(sql`status = 'ativa'`),
    /** O caminho da consulta de disponibilidade. */
    agendaIdx: index('consultoria_reservas_agenda_idx').on(
      t.configuracaoId,
      t.status,
      t.expiraEm,
    ),
    /** "A reserva viva deste Cliente" — usado no retorno ao fluxo e no refresh. */
    clienteIdx: index('consultoria_reservas_cliente_idx').on(
      t.clienteUsuarioId,
      t.status,
    ),
    statusValido: check(
      'consultoria_reservas_status_valido',
      sql`status in ('ativa', 'expirada', 'liberada', 'confirmada')`,
    ),
    periodoCoerente: check(
      'consultoria_reservas_periodo_coerente',
      sql`fim_em > inicio_em`,
    ),
    valorPositivo: check(
      'consultoria_reservas_valor_positivo',
      sql`valor_centavos > 0`,
    ),
    duracaoValida: check(
      'consultoria_reservas_duracao_valida',
      sql`duracao_minutos > 0 and duracao_minutos <= 480`,
    ),
    descricaoPreenchida: check(
      'consultoria_reservas_descricao_preenchida',
      sql`length(btrim(descricao)) > 0`,
    ),
  }),
)
