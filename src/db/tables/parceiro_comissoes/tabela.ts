import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { contratacoesServico } from '../contratacoes_servico/tabela'
import { parceiroAtribuicoes } from '../parceiro_atribuicoes/tabela'
import { parceiros } from '../parceiros/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * A comissão que um negócio gerou para o parceiro.
 *
 * ## Por que uma tabela, e não uma conta na tela
 *
 * Enquanto era estimativa, multiplicar valor por percentual na hora de
 * desenhar bastava. Agora é direito adquirido: o parceiro contratou o
 * programa sob 10%, e mudar o percentual amanhã não pode reescrever o que ele
 * já ganhou. Valor-base, percentual e resultado são **copiados** para cá no
 * instante em que o direito nasce, e nunca recalculados — o mesmo princípio de
 * `parceiro_atribuicoes.prazo_dias` e de `oportunidades.expira_em`.
 *
 * ## Uma por negócio
 *
 * O índice único em `contratacao_id` é a garantia: reprocessar a contratação,
 * recarregar a página ou repetir a action não cria a segunda comissão. Quem
 * impede é o banco, não uma consulta antes do insert.
 *
 * ## O ciclo
 *
 * `gerada` no instante da contratação efetiva — o direito existe, mas o
 * serviço ainda não terminou. `disponivel` quando a contratação é concluída
 * pelo prestador. `cancelada` quando ela é cancelada antes disso. `paga` fica
 * reservado para quando existir pagamento ao parceiro, que esta fatia não
 * implementa: não há saque, saldo, extrato nem contas a pagar em lugar nenhum.
 *
 * ## De onde sai o dinheiro
 *
 * Da parte da Vincis. Nada aqui toca o valor do prestador — `valor_base` é
 * apenas a referência sobre a qual o percentual incide, e nenhuma coluna desta
 * tabela entra no cálculo do que o profissional recebe.
 */
export const parceiroComissoes = pgTable(
  'parceiro_comissoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    /** A atribuição que deu origem ao direito. Leva ao ciclo e ao histórico. */
    atribuicaoId: uuid('atribuicao_id')
      .notNull()
      .references(() => parceiroAtribuicoes.id, { onDelete: 'cascade' }),
    /** O negócio. Sem cascata: contratação não é apagada, é encerrada. */
    contratacaoId: uuid('contratacao_id')
      .notNull()
      .references(() => contratacoesServico.id),
    /** O cliente que contratou. Sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Quem executa o serviço. */
    profissionalId: uuid('profissional_id')
      .notNull()
      .references(() => usuarios.id),
    /** Categoria do negócio, no vocabulário da taxonomia. */
    servicoReferencia: varchar('servico_referencia', { length: 30 }),
    /** O valor do serviço no instante do direito. Congelado. */
    valorBaseCentavos: integer('valor_base_centavos').notNull(),
    /** O percentual aplicado, em pontos percentuais. Congelado. */
    percentual: numeric('percentual', { precision: 5, scale: 2 }).notNull(),
    /** O resultado, calculado no servidor. Congelado. */
    valorCentavos: integer('valor_centavos').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('gerada'),
    geradaEm: timestamp('gerada_em').defaultNow().notNull(),
    disponivelEm: timestamp('disponivel_em'),
    pagaEm: timestamp('paga_em'),
    canceladaEm: timestamp('cancelada_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma comissão por negócio — garantia do banco.
    porContratacaoUnica: uniqueIndex('parceiro_comissoes_contratacao_unica').on(
      t.contratacaoId,
    ),
    // "Quanto eu gerei?", do mais recente para o mais antigo.
    doParceiroIdx: index('parceiro_comissoes_parceiro_idx').on(
      t.parceiroId,
      t.createdAt,
    ),
  }),
)
