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
    /**
     * Estado do compromisso.
     *
     * `agendada` é o compromisso de pé; `cancelada` é o compromisso desfeito,
     * que continua existindo como registro e deixa de ocupar a agenda. Não há
     * `remarcada`: remarcar muda **quando**, não **se** — a consultoria segue
     * agendada, no horário novo, e o que aconteceu fica no histórico do
     * Atendimento. Um estado para isso criaria uma consultoria que é ao mesmo
     * tempo válida e "remarcada", e toda consulta de agenda teria de lembrar de
     * aceitar os dois.
     *
     * `concluida` é a consultoria que o Profissional declarou realizada. Um
     * único nome para um único significado: não existem `finalizada`,
     * `encerrada` nem `realizada` ao lado dela.
     */
    status: varchar('status', { length: 20 }).notNull().default('agendada'),
    /**
     * O cancelamento, registrado e não apagado.
     *
     * As três colunas andam juntas: quando, por quem e por quê. Apagar a linha
     * seria mais simples e destruiria a única prova de que o compromisso
     * existiu — o Cliente pagou, o protocolo foi aberto, e essa história não
     * pode depender de ninguém ter tirado print.
     *
     * `cancelado_por` é o usuário da sessão que cancelou, e é o que permite a
     * tela dizer "cancelada pelo Profissional" sem inferir pelo motivo estar
     * preenchido ou não.
     */
    canceladoEm: timestamp('cancelado_em'),
    canceladoPor: uuid('cancelado_por'),
    /** Opcional para o Cliente, obrigatório para o Profissional. Regra na ação. */
    motivoCancelamento: varchar('motivo_cancelamento', { length: 500 }),
    /**
     * A conclusão, declarada por uma pessoa.
     *
     * Nunca deduzida. O horário ter passado não conclui nada — a consulta pode
     * não ter acontecido —, e ter entrado na sala Daily também não: presença
     * não é atendimento prestado. Quem afirma que a consultoria foi realizada é
     * o Profissional responsável, num clique explícito, e é essa afirmação que
     * fica gravada aqui com autor e instante.
     */
    concluidoEm: timestamp('concluido_em'),
    concluidoPor: uuid('concluido_por'),
    /**
     * A última remarcação — quando, e quantas houve.
     *
     * O relato completo de cada mudança (de que horário para qual, por quem)
     * vive nos eventos do Atendimento, que são imutáveis e já são a fonte
     * histórica da plataforma. Aqui ficam só os dois dados que as telas e as
     * regras precisam ler sem varrer histórico.
     */
    remarcadoEm: timestamp('remarcado_em'),
    remarcacoes: integer('remarcacoes').notNull().default(0),
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
    /**
     * A varredura dos lembretes, que roda a cada dez minutos.
     *
     * Ela pergunta "quais consultorias de pé começam nas próximas 25 horas?" —
     * uma pergunta global, sem `configuracao_id`, que os outros índices não
     * atendem. Parcial porque só interessa o estado `agendada`: cancelada e
     * concluída não recebem lembrete, e mantê-las fora deixa o índice pequeno
     * mesmo depois de anos de histórico.
     */
    lembretesIdx: index('consultoria_agendamentos_lembretes_idx')
      .on(t.inicioEm)
      .where(sql`status = 'agendada'`),
    clienteIdx: index('consultoria_agendamentos_cliente_idx').on(
      t.clienteUsuarioId,
      t.inicioEm,
    ),
    prestadorIdx: index('consultoria_agendamentos_prestador_idx').on(
      t.prestadorId,
      t.inicioEm,
    ),
    canceladoPorFk: foreignKey({
      columns: [t.canceladoPor],
      foreignColumns: [usuarios.id],
      name: 'consultoria_agendamentos_cancelado_por_fk',
    }),
    concluidoPorFk: foreignKey({
      columns: [t.concluidoPor],
      foreignColumns: [usuarios.id],
      name: 'consultoria_agendamentos_concluido_por_fk',
    }),
    statusValido: check(
      'consultoria_agendamentos_status_valido',
      sql`status in ('agendada', 'cancelada', 'concluida')`,
    ),
    /**
     * Concluída implica os dois carimbos; qualquer outro estado, nenhum.
     *
     * Mesma defesa do cancelamento: o banco recusa tanto o estado trocado sem
     * registro de autoria quanto o carimbo de conclusão numa consultoria que
     * ainda não foi concluída.
     */
    conclusaoCoerente: check(
      'consultoria_agendamentos_conclusao_coerente',
      sql`(status = 'concluida' and concluido_em is not null and concluido_por is not null)
          or (status <> 'concluida' and concluido_em is null and concluido_por is null)`,
    ),
    /**
     * Cancelada implica os três dados do cancelamento; agendada implica nenhum.
     *
     * É a regra que impede o estado meio-gravado — status trocado sem registrar
     * quem e quando, ou carimbo de cancelamento numa consultoria que segue de
     * pé. O banco recusa as duas formas de mentira.
     */
    cancelamentoCoerente: check(
      'consultoria_agendamentos_cancelamento_coerente',
      sql`(status = 'cancelada' and cancelado_em is not null and cancelado_por is not null)
          or (status <> 'cancelada' and cancelado_em is null and cancelado_por is null)`,
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
