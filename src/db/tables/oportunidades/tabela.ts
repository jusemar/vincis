import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Oportunidade: um Cliente procurando alguém para um trabalho.
 *
 * É a etapa **anterior** à contratação, e por isso não é `contratacoes_servico`
 * nem `atendimentos`. Aqui ainda não existe prestador escolhido, não existe
 * preço e não existe trabalho em execução — existe uma necessidade descrita
 * por alguém que não sabe a quem recorrer. Guardá-la no Atendimento obrigaria a
 * inventar um `prestador_id` para uma solicitação que, por definição, ainda não
 * tem dono.
 *
 * A categoria é a mesma do cadastro profissional — o Cliente escolhe entre as
 * categorias que os prestadores realmente declaram, e é ela que decide quem
 * enxerga a solicitação, através de `lib/compatibilidade`. As `especialidades`
 * são um recorte opcional dentro da categoria, vindo do mesmo vocabulário
 * fechado que a busca pública usa: servem para o prestador entender o pedido,
 * e não para estreitar quem o recebe.
 *
 * `abrangencia` guarda `BR` (país inteiro) ou a UF. Substituiu o par
 * cidade/estado da primeira versão: cidade digitada à mão produz três grafias
 * para o mesmo lugar e nenhum filtro confiável.
 *
 * Nenhum dado de contato mora aqui — telefone, e-mail e endereço do Cliente
 * continuam onde estavam, fora do alcance desta tela.
 *
 * ## Duas portas de entrada, uma tabela
 *
 * `visibilidade` distingue a solicitação **pública** — nascida em
 * `/profissionais`, que todo prestador compatível enxerga — da **privada**,
 * nascida no perfil de alguém e dirigida só a ele. Uma tabela paralela
 * duplicaria propostas, contrapropostas, anexos, pagamento e Atendimento: os
 * dois fluxos são a mesma negociação, e a única diferença real é **quem
 * alcança** a solicitação. Essa diferença cabe em duas colunas.
 *
 * `destinatario_id` é o Profissional escolhido. A restrição abaixo é do banco,
 * e não da tela: privada sem destinatário seria uma solicitação que ninguém
 * pode responder, e pública com destinatário seria uma regra de acesso
 * silenciosamente diferente da que a vitrine aplica.
 */
export const oportunidades = pgTable(
  'oportunidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Conta do Cliente. Vem sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Categoria do cadastro profissional. Ver `CATEGORIAS_OPORTUNIDADE`. */
    categoria: varchar('categoria', { length: 30 }).notNull(),
    /**
     * `publica` | `privada`. Nasce pública.
     *
     * O padrão preserva as solicitações que já existiam: todas elas são
     * públicas, e nenhuma linha precisou ser reescrita.
     */
    visibilidade: varchar('visibilidade', { length: 10 })
      .notNull()
      .default('publica'),
    /**
     * O Profissional a quem a solicitação privada foi dirigida.
     *
     * Nulo nas públicas — nelas ainda não existe destinatário, que é
     * exatamente o que a etapa significa. Sem `on delete cascade`: a
     * solicitação é do Cliente e o histórico dele não desaparece porque a
     * outra ponta saiu.
     */
    destinatarioId: uuid('destinatario_id').references(() => usuarios.id),
    /**
     * Especialidades escolhidas dentro da categoria. Opcional e validado contra
     * o vocabulário fechado da taxonomia — texto livre não entra aqui.
     */
    especialidades: text('especialidades').array().notNull().default([]),
    /** Resumo em uma linha, gerado a partir da descrição na criação. */
    titulo: varchar('titulo', { length: 160 }).notNull(),
    descricao: text('descricao').notNull(),
    /** `BR` ou a sigla da UF. Nunca cidade. */
    abrangencia: varchar('abrangencia', { length: 2 }).notNull().default('BR'),
    /**
     * Quanto o Cliente pretende investir, em centavos.
     *
     * Referência informada por ele, e nada além disso: não é teto, não é preço
     * e não impede proposta de valor diferente. Nulo quando não informado —
     * zero seria um orçamento declarado que ninguém declarou.
     */
    valorPretendidoCentavos: integer('valor_pretendido_centavos'),
    /**
     * `aberta` | `expirada` | `encerrada` | `cancelada`. Nasce aberta.
     *
     * `expirada` e `cancelada` são estados diferentes de propósito: cancelar é
     * ato de alguém, expirar é o relógio. Confundi-los apagaria a diferença
     * entre "desisti" e "ninguém fechou a tempo".
     */
    status: varchar('status', { length: 20 }).notNull().default('aberta'),
    /**
     * Por que a solicitação foi encerrada. Nulo enquanto ela não foi.
     *
     * `encerrada` sempre significou uma coisa só — parou de receber propostas —
     * e passou a ter duas causas possíveis: o acordo fechado e a recusa do
     * destinatário de uma solicitação **privada**. As duas param a distribuição
     * do mesmo jeito, então continuam sendo o mesmo `status`; o que muda é a
     * história que o Cliente lê, e história é motivo, não estado.
     *
     * Foi por isso que nem `cancelada` (ato do Cliente) nem `expirada` (o
     * relógio) serviram: nenhuma das duas descreve "o profissional escolhido
     * disse que não vai propor".
     *
     * Valores: `acordo` | `sem_interesse`.
     */
    motivoEncerramento: varchar('motivo_encerramento', { length: 20 }),
    /**
     * Fim do prazo global, calculado na criação a partir da configuração da
     * Gestão. Congelado: mudar a configuração depois não deve reabrir nem
     * encurtar solicitações que já estavam em curso.
     */
    expiraEm: timestamp('expira_em'),
    encerradaEm: timestamp('encerrada_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A vitrine do prestador é sempre "as abertas e no prazo da minha
    // categoria, mais recentes primeiro".
    vitrineIdx: index('oportunidades_vitrine_idx').on(
      t.categoria,
      t.status,
      t.createdAt,
    ),
    // A lista do Cliente é "as minhas, mais recentes primeiro".
    clienteIdx: index('oportunidades_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    // A caixa do destinatário é "as dirigidas a mim, mais recentes primeiro".
    destinatarioIdx: index('oportunidades_destinatario_idx').on(
      t.destinatarioId,
      t.status,
      t.createdAt,
    ),
    /**
     * Visibilidade e destinatário andam juntos — garantia do banco.
     *
     * Sem isto, um caminho novo que esquecesse de gravar o destinatário criaria
     * uma solicitação "privada" que nenhuma consulta entrega a ninguém, e um
     * que gravasse destinatário numa pública abriria uma regra de acesso que a
     * vitrine não conhece.
     */
    visibilidadeCoerente: check(
      'oportunidades_visibilidade_destinatario',
      sql`(visibilidade = 'publica' and destinatario_id is null) or (visibilidade = 'privada' and destinatario_id is not null)`,
    ),
  }),
)
