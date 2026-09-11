import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { assinaturaCompetencias } from '../assinatura_competencias/tabela'
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
 * ## Avulsa e recorrente, uma infraestrutura
 *
 * `tipo = 'avulso'` é a comissão de 10% de uma contratação do catálogo, e
 * aponta para `contratacao_id`. `tipo = 'recorrente'` é a comissão de **um mês**
 * de uma assinatura Vincis, e aponta para `competencia_id` — nunca para a
 * assinatura inteira. Ela só nasce quando o mês está cumprido **e** coberto por
 * pagamento confirmado, então nasce direto `disponivel`: não existe o intervalo
 * "direito existe, serviço não terminou" que `gerada` descreve no avulso. As
 * duas entram no mesmo saldo e no mesmo saque.
 *
 * `pagamento_estornado_em` marca a comissão recorrente cujo dinheiro voltou:
 * se ainda não tinha sido paga, ela é cancelada; se já tinha, fica `paga` e o
 * carimbo sinaliza a compensação futura.
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
    /** `avulso` ou `recorrente`. Decide qual das duas origens abaixo vale. */
    tipo: varchar('tipo', { length: 20 }).notNull().default('avulso'),
    /**
     * O negócio avulso. Sem cascata: contratação não é apagada, é encerrada.
     * Nulo na recorrente.
     */
    contratacaoId: uuid('contratacao_id').references(() => contratacoesServico.id),
    /** O mês da assinatura que gerou a recorrente. Nulo na avulsa. */
    competenciaId: uuid('competencia_id').references(
      () => assinaturaCompetencias.id,
    ),
    /** O cliente que contratou. Sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** Quem executa o serviço. Obrigatório na avulsa; na assinatura, opcional. */
    profissionalId: uuid('profissional_id').references(() => usuarios.id),
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
    /** O pagamento que sustentava a recorrente foi estornado. */
    pagamentoEstornadoEm: timestamp('pagamento_estornado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma comissão por negócio — garantia do banco.
    porContratacaoUnica: uniqueIndex('parceiro_comissoes_contratacao_unica').on(
      t.contratacaoId,
    ),
    // Um mês, no máximo uma comissão — garantia do banco.
    porCompetenciaUnica: uniqueIndex('parceiro_comissoes_competencia_unica').on(
      t.competenciaId,
    ),
    tipoValido: check(
      'parceiro_comissoes_tipo_valido',
      sql`${t.tipo} in ('avulso', 'recorrente')`,
    ),
    // Cada tipo com a sua origem, e só ela.
    origemCoerente: check(
      'parceiro_comissoes_origem_coerente',
      sql`(${t.tipo} = 'avulso' and ${t.contratacaoId} is not null
            and ${t.competenciaId} is null and ${t.profissionalId} is not null)
        or (${t.tipo} = 'recorrente' and ${t.competenciaId} is not null
            and ${t.contratacaoId} is null)`,
    ),
    // "Quanto eu gerei?", do mais recente para o mais antigo.
    doParceiroIdx: index('parceiro_comissoes_parceiro_idx').on(
      t.parceiroId,
      t.createdAt,
    ),
  }),
)
