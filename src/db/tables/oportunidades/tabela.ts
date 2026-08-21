import {
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
 * Oportunidade pública: um Cliente procurando alguém para um trabalho.
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
  }),
)
