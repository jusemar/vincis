import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { consultoriaConfiguracoes } from '../consultoria_configuracoes/tabela'

/**
 * Faixa semanal recorrente em que o Profissional atende.
 *
 * ## Recorrência, e não calendário
 *
 * Uma linha diz "às segundas, das 09:00 às 12:00" — e vale para toda segunda
 * dentro do horizonte. Nenhum horário futuro é materializado: os slots são
 * derivados destas faixas mais as exceções, no servidor, no momento da
 * consulta. Gravar slot por slot criaria milhares de linhas que envelhecem
 * sozinhas e que precisariam ser regeradas a cada mudança de duração.
 *
 * Múltiplas faixas no mesmo dia são o caso normal (manhã e tarde), e é por isso
 * que a chave não é `(configuracao, dia)`.
 *
 * ## Horas locais
 *
 * `time` sem fuso, de propósito: a faixa é uma hora de parede — "nove da
 * manhã" continua sendo nove da manhã depois de qualquer mudança de horário de
 * verão. O fuso que transforma isso em instante está na configuração, e é
 * aplicado no cálculo do slot.
 *
 * `dia_semana` segue a convenção do JavaScript: 0 = domingo … 6 = sábado. A
 * mesma que `Date.getUTCDay()` devolve, para que a conversão não precise de
 * tabela de tradução.
 */
export const consultoriaDisponibilidades = pgTable(
  'consultoria_disponibilidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Dona da faixa é a consultoria, não o prestador.
     *
     * Repetir `prestador_id` aqui criaria duas verdades sobre a mesma coisa e
     * um caminho para uma faixa apontar para a consultoria de A com o prestador
     * de B. `cascade` porque faixa sem consultoria não significa nada.
     */
    configuracaoId: uuid('configuracao_id').notNull(),
    diaSemana: integer('dia_semana').notNull(),
    horaInicio: time('hora_inicio').notNull(),
    horaFim: time('hora_fim').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /**
     * Nome explícito da chave estrangeira.
     *
     * O nome automático do Drizzle juntaria as duas tabelas e passaria dos 63
     * caracteres que o PostgreSQL aceita num identificador — ele truncaria em
     * silêncio, e a partir daí o nome no banco deixaria de ser o nome no
     * schema. Nomear aqui mantém os dois iguais.
     */
    configuracaoFk: foreignKey({
      columns: [t.configuracaoId],
      foreignColumns: [consultoriaConfiguracoes.id],
      name: 'consultoria_disponibilidades_configuracao_fk',
    }).onDelete('cascade'),
    /**
     * Duas faixas ativas não podem começar no mesmo minuto do mesmo dia.
     *
     * É o pedaço da regra de sobreposição que o banco consegue garantir sozinho
     * e barato. A sobreposição parcial (09:00–12:00 contra 11:00–14:00) exigiria
     * `EXCLUDE USING gist` e a extensão `btree_gist` — uma extensão a mais para
     * manter em todo ambiente, incluindo o banco descartável dos testes. Ela é
     * validada na Server Action, dentro da transação que trava a linha da
     * configuração, que é o mesmo desenho que o projeto já usa para regras
     * relacionais em `contratar.ts`.
     */
    faixaUnica: uniqueIndex('consultoria_disponibilidades_faixa_unica')
      .on(t.configuracaoId, t.diaSemana, t.horaInicio)
      .where(sql`ativo`),
    agendaIdx: index('consultoria_disponibilidades_agenda_idx').on(
      t.configuracaoId,
      t.diaSemana,
      t.horaInicio,
    ),
    diaValido: check(
      'consultoria_disponibilidades_dia_valido',
      sql`dia_semana between 0 and 6`,
    ),
    // Faixa invertida ou de duração zero não é agenda — é dado corrompido.
    faixaCoerente: check(
      'consultoria_disponibilidades_faixa_coerente',
      sql`hora_inicio < hora_fim`,
    ),
  }),
)
