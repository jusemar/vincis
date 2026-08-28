import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  time,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'

/**
 * O que foge da rotina semanal, numa data específica.
 *
 * Três formas, e as três são necessárias para que ninguém precise desmontar a
 * recorrência para resolver um dia:
 *
 * - `indisponivel_dia` — o dia inteiro sai do ar (feriado, viagem). Sem horas.
 * - `bloqueio_parcial` — um pedaço do dia sai (13:00–15:00 numa audiência).
 * - `disponivel_extra` — um pedaço entra num dia que a recorrência não cobre
 *   (um domingo em que o Profissional decidiu atender).
 *
 * ## Data local, e não instante
 *
 * `date` sem hora: "25/12/2026" é uma data na agenda do Profissional, e o fuso
 * que a transforma em intervalo de tempo é o da configuração. Guardar um
 * `timestamp` aqui faria a data escorregar para o dia anterior ou seguinte
 * conforme o fuso de quem lesse.
 *
 * ## Por que não há índice único por data
 *
 * Um dia pode legitimamente ter várias exceções — dois bloqueios parciais, ou
 * um bloqueio e uma disponibilidade extra em outro horário. A coerência entre
 * elas é resolvida no cálculo: o bloqueio é subtraído por último e sempre
 * vence, então nenhuma combinação produz horário que o Profissional recusou.
 */
export const consultoriaExcecoes = pgTable(
  'consultoria_excecoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configuracaoId: uuid('configuracao_id').notNull(),
    /** Data local da agenda, no fuso da configuração. `AAAA-MM-DD`. */
    data: date('data', { mode: 'string' }).notNull(),
    tipo: varchar('tipo', { length: 20 }).notNull(),
    /** Nulos quando o tipo é `indisponivel_dia`. Obrigatórios nos demais. */
    horaInicio: time('hora_inicio'),
    horaFim: time('hora_fim'),
    /** Anotação interna do Profissional. Nunca sai para o Cliente. */
    motivo: varchar('motivo', { length: 240 }),
    /**
     * O bloqueio de vários dias que originou esta exceção.
     *
     * Férias de dez dias são dez linhas — uma por data —, porque a agenda
     * raciocina por dia e reescrever isso para guardar intervalos obrigaria
     * todo o gerador de horários a entender um segundo formato. O que faltava
     * era só o laço: sem ele, desfazer as férias seria apagar dez exceções
     * soltas, uma a uma, sem nada dizendo que pertenciam ao mesmo motivo.
     *
     * Nulo para a exceção avulsa — um feriado, um encaixe —, que é a maioria.
     */
    grupoId: uuid('grupo_id'),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Nome explícito: o automático passaria dos 63 caracteres do PostgreSQL e
    // seria truncado, divergindo do nome declarado no schema.
    configuracaoFk: foreignKey({
      columns: [t.configuracaoId],
      foreignColumns: [consultoriaConfiguracoes.id],
      name: 'consultoria_excecoes_configuracao_fk',
    }).onDelete('cascade'),
    /** Desfazer um bloqueio inteiro é encontrar todas as datas dele de uma vez. */
    grupoIdx: index('consultoria_excecoes_grupo_idx').on(t.grupoId),
    agendaIdx: index('consultoria_excecoes_agenda_idx').on(
      t.configuracaoId,
      t.data,
    ),
    /**
     * O tipo decide se as horas existem, e o banco cobra isso.
     *
     * É a única forma de impedir um `bloqueio_parcial` sem horas — que o
     * cálculo não saberia interpretar e que, lido com pressa, poderia virar um
     * dia inteiro bloqueado por acidente.
     */
    tipoCoerente: check(
      'consultoria_excecoes_tipo_coerente',
      sql`(tipo = 'indisponivel_dia' and hora_inicio is null and hora_fim is null)
          or (tipo in ('bloqueio_parcial', 'disponivel_extra')
              and hora_inicio is not null
              and hora_fim is not null
              and hora_inicio < hora_fim)`,
    ),
  }),
)
