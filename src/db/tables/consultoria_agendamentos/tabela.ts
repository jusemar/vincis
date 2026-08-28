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
import { consultoriaReservas } from '../consultoria_reservas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * A consultoria contratada — o registro definitivo.
 *
 * ## Por que não bastava a reserva
 *
 * `consultoria_reservas` é um rascunho com prazo de validade: nasce para
 * caducar em dez minutos e não sabe distinguir "ninguém pagou" de "isto é um
 * compromisso". Guardar a contratação lá dentro faria o mesmo registro
 * significar duas coisas conforme a hora do dia. Aqui é o oposto: uma linha
 * aqui é um compromisso assumido, sem prazo de validade, e ela continua
 * bloqueando o horário muito depois de a reserva de origem ter vencido.
 *
 * `reserva_id` é único: uma reserva vira **uma** consultoria. É esta linha —
 * e não o botão desabilitado da tela — que faz duplo clique, F5 e duas
 * requisições simultâneas convergirem para a mesma contratação.
 *
 * ## Por que não passa por oportunidade
 *
 * Porque não houve oportunidade. A Consultoria Agendada é a terceira porta de
 * entrada da plataforma, ao lado da contratação de catálogo e do acordo de uma
 * solicitação pública; forjar uma oportunidade vazia só para reaproveitar a
 * tabela de pagamento existente encheria os painéis de solicitações que ninguém
 * abriu e faria toda consulta futura precisar excluí-las à mão.
 *
 * ## Por que os dados estão congelados aqui
 *
 * `valor_centavos`, `duracao_minutos`, `timezone` e `descricao` vêm da reserva,
 * que por sua vez os fotografou no instante em que o horário foi preso. O
 * Profissional pode reajustar o preço no minuto seguinte — o que foi contratado
 * não muda. Ler a configuração atual para exibir uma contratação passada seria
 * reescrever o contrato depois de assinado.
 *
 * Não existe `atendimento_id` aqui de propósito. Quem aponta é o Atendimento,
 * por `consultoria_agendamento_id`, exatamente como ele já aponta para a
 * contratação e para a oportunidade. Guardar os dois lados criaria um par de
 * chaves capaz de discordar entre si.
 */
export const consultoriaAgendamentos = pgTable(
  'consultoria_agendamentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A reserva que virou compromisso. Uma para uma. */
    reservaId: uuid('reserva_id').notNull(),
    configuracaoId: uuid('configuracao_id').notNull(),
    /**
     * As partes, gravadas explicitamente.
     *
     * O Profissional é alcançável pela configuração, mas aqui ele é **parte do
     * contrato**, e não um caminho de navegação: um contrato registra quem
     * contratou quem, e continua registrando mesmo que a agenda de origem mude
     * de dono ou deixe de existir.
     */
    prestadorId: uuid('prestador_id').notNull(),
    clienteUsuarioId: uuid('cliente_usuario_id').notNull(),
    inicioEm: timestamp('inicio_em').notNull(),
    fimEm: timestamp('fim_em').notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull(),
    valorCentavos: integer('valor_centavos').notNull(),
    duracaoMinutos: integer('duracao_minutos').notNull(),
    /** O assunto que o Cliente escreveu. Privado — ver a consulta de agenda. */
    descricao: varchar('descricao', { length: 1000 }).notNull(),
    /**
     * Estado do compromisso.
     *
     * Só `agendada` existe nesta etapa. Cancelamento, remarcação e "realizada"
     * são etapas próprias, com regra, autorização e histórico próprios —
     * declarar os valores agora só ensaiaria uma máquina de estados que ninguém
     * ainda escreveu.
     */
    status: varchar('status', { length: 20 }).notNull().default('agendada'),
    /**
     * A sala Daily desta consultoria — o **nome**, e nada além dele.
     *
     * ## Por que aqui, e não numa tabela nova
     *
     * A relação é 1:1 e não tem histórico: uma consultoria tem no máximo uma
     * sala, e uma sala pertence a exatamente uma consultoria. Uma tabela à
     * parte só acrescentaria um join e a possibilidade de existirem duas linhas
     * discordando sobre qual é "a" sala.
     *
     * ## Por que o índice único é a trava, e não o `if`
     *
     * Cliente e Profissional podem clicar em "Entrar" no mesmo segundo. Quem
     * decide qual nome vale é o banco: o primeiro `UPDATE ... WHERE
     * daily_room_name IS NULL` vence, o segundo não afeta linha nenhuma e vai
     * reler o nome do vencedor. Duas salas definitivas não conseguem nascer
     * porque só existe uma linha para gravar o nome.
     *
     * ## O que **não** mora aqui
     *
     * Meeting token, URL com token, chave de API. Nada disso é persistido: o
     * token é temporário por definição, vive uma entrada e é gerado de novo a
     * cada clique, sempre depois de o servidor revalidar janela e participação.
     * O nome da sala sozinho não autoriza ninguém — a sala é privada.
     */
    dailyRoomName: varchar('daily_room_name', { length: 128 }),
    /** Quando a sala foi criada na Daily. Nulo enquanto ninguém entrou. */
    dailyRoomCriadaEm: timestamp('daily_room_criada_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    reservaFk: foreignKey({
      columns: [t.reservaId],
      foreignColumns: [consultoriaReservas.id],
      name: 'consultoria_agendamentos_reserva_fk',
    }),
    /**
     * Sem `cascade`, ao contrário das faixas e das exceções.
     *
     * Apagar a agenda de um Profissional não pode apagar consultorias que
     * pessoas contrataram e pagaram. O compromisso sobrevive à configuração que
     * o originou.
     */
    configuracaoFk: foreignKey({
      columns: [t.configuracaoId],
      foreignColumns: [consultoriaConfiguracoes.id],
      name: 'consultoria_agendamentos_configuracao_fk',
    }),
    prestadorFk: foreignKey({
      columns: [t.prestadorId],
      foreignColumns: [usuarios.id],
      name: 'consultoria_agendamentos_prestador_fk',
    }),
    clienteFk: foreignKey({
      columns: [t.clienteUsuarioId],
      foreignColumns: [usuarios.id],
      name: 'consultoria_agendamentos_cliente_fk',
    }),
    /** A trava de idempotência do fluxo inteiro: uma reserva, uma consultoria. */
    reservaUnica: uniqueIndex('consultoria_agendamentos_reserva_unica').on(
      t.reservaId,
    ),
    /**
     * Uma sala nunca é reaproveitada por duas consultorias.
     *
     * O nome é sorteado, então uma colisão é praticamente impossível — mas
     * "praticamente" não é uma garantia, e este índice transforma o improvável
     * em erro imediato em vez de duas consultorias dividindo a mesma chamada.
     * `NULL` se repete à vontade: no Postgres nulos não colidem, e a esmagadora
     * maioria das consultorias nunca chega a abrir sala.
     */
    dailyRoomUnica: uniqueIndex('consultoria_agendamentos_daily_room_unica').on(
      t.dailyRoomName,
    ),
    /** O caminho da consulta de ocupação do calendário. */
    agendaIdx: index('consultoria_agendamentos_agenda_idx').on(
      t.configuracaoId,
      t.status,
      t.inicioEm,
    ),
    clienteIdx: index('consultoria_agendamentos_cliente_idx').on(
      t.clienteUsuarioId,
      t.inicioEm,
    ),
    prestadorIdx: index('consultoria_agendamentos_prestador_idx').on(
      t.prestadorId,
      t.inicioEm,
    ),
    statusValido: check(
      'consultoria_agendamentos_status_valido',
      sql`status in ('agendada')`,
    ),
    periodoCoerente: check(
      'consultoria_agendamentos_periodo_coerente',
      sql`fim_em > inicio_em`,
    ),
    valorPositivo: check(
      'consultoria_agendamentos_valor_positivo',
      sql`valor_centavos > 0`,
    ),
  }),
)
