import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { contratacoesServico } from '../contratacoes_servico/tabela'
import { oportunidades } from '../oportunidades/tabela'
import { parceiroIndicacoes } from '../parceiro_indicacoes/tabela'
import { parceiros } from '../parceiros/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * De qual parceiro nasceu este negócio.
 *
 * ## Por que uma tabela de ligação, e não uma coluna em `oportunidades`
 *
 * Porque a atribuição não é da oportunidade — é da **relação** entre um negócio
 * e um parceiro, e negócio na Vincis nasce de três lugares diferentes:
 * oportunidade, contratação direta de catálogo e consultoria agendada. Uma
 * coluna em `oportunidades` cobriria um terço do problema e ainda obrigaria a
 * mexer numa tabela com duas restrições `check`, um índice único parcial e
 * dezenas de consumidores. Aqui nada de comercial é tocado: esta tabela é
 * folha, ninguém no fluxo de orçamento, proposta, pagamento ou Atendimento
 * sequer sabe que ela existe.
 *
 * Também não é `oportunidades.origem`: aquela coluna responde *o que a pessoa
 * estava fazendo* (`solicitacao` | `simulacao_preco`), e é independente de
 * *quem indicou* — uma oportunidade nascida da simulação também pode ter vindo
 * de um parceiro.
 *
 * ## A atribuição é do negócio, nunca do cliente
 *
 * Uma linha por oportunidade, cada uma com prazo e validade próprios: o plano
 * contábil de Carlos pode valer 60 dias e o jurídico 10, e um expirar não mexe
 * no outro. O que **não** varia é o parceiro — Carlos entrou na base pela
 * indicação de João e todos os negócios dele nascem sob João, inclusive os que
 * vierem depois de uma atribuição expirar. Expirar é "esta indicação não vale
 * mais para aquele serviço", nunca "o cliente voltou ao mercado".
 *
 * ## Uma só por oportunidade
 *
 * O índice único em `oportunidade_id` é a garantia de idempotência. O clique
 * repetido na simulação já não cria oportunidade nova (`oportunidades_intencao_unica`),
 * e aqui vale o mesmo princípio: quem impede a segunda linha é o banco, não uma
 * consulta antes do insert.
 *
 * ## `parceiro_id` desnormalizado
 *
 * Ele é alcançável por `indicacao_id`, mas o painel pergunta "quais negócios
 * vieram de mim?" a toda hora. Guardar a resposta evita um join em cada leitura
 * de uma coluna que, por construção, nunca muda depois de gravada.
 *
 * ## Rastreamento, não comissão
 *
 * Não há valor, percentual, prazo, status financeiro nem nada pagável aqui.
 * Registrar que João trouxe o cliente é um fato; decidir se isso vira dinheiro
 * é outra conversa, e ela vai precisar de outras colunas — provavelmente em
 * outra tabela.
 *
 * ## As origens do negócio
 *
 * Duas hoje, cada uma na sua coluna nulável, com um `check` de "exatamente uma
 * preenchida": `oportunidade_id` para o que nasce de uma solicitação e
 * `contratacao_id` para o que nasce da contratação direta do catálogo. As duas
 * são caminhos reais do Cliente, e cobrir só o primeiro fazia o parceiro
 * desaparecer justamente quando o negócio acontecia pelo segundo.
 *
 * Consultoria ainda não entra: o agendamento só nasce **depois do pagamento**,
 * então "quando o negócio começou" é ali uma pergunta de produto, não de
 * esquema. Quando for respondida, é mais uma coluna nulável e mais um braço no
 * `check`.
 */
export const parceiroAtribuicoes = pgTable(
  'parceiro_atribuicoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** O ciclo que deu origem. Leva ao histórico completo do lead. */
    indicacaoId: uuid('indicacao_id')
      .notNull()
      .references(() => parceiroIndicacoes.id, { onDelete: 'cascade' }),
    parceiroId: uuid('parceiro_id')
      .notNull()
      .references(() => parceiros.id, { onDelete: 'cascade' }),
    /** O cliente. Vem sempre da sessão, nunca da requisição. */
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /**
     * O negócio originado, quando ele nasceu de uma oportunidade.
     *
     * Sem cascata: apagar a atribuição junto com a oportunidade seria apagar o
     * histórico de um terceiro — e oportunidade, nesta plataforma, não é
     * apagada, é encerrada.
     *
     * Nulo quando o negócio veio da contratação direta do catálogo. Exatamente
     * uma das duas origens está preenchida, e quem garante isso é o `check`.
     */
    oportunidadeId: uuid('oportunidade_id').references(() => oportunidades.id),
    /**
     * O negócio originado, quando o cliente contratou direto do catálogo.
     *
     * É o caminho que não passa por oportunidade nenhuma: o cliente abre o
     * serviço do prestador e contrata. Sem esta coluna, a indicação de quem
     * trouxe esse cliente ficava sem registro — o negócio acontecia e o
     * parceiro não aparecia em lugar nenhum.
     */
    contratacaoId: uuid('contratacao_id').references(
      () => contratacoesServico.id,
    ),
    /**
     * Como a origem foi reconhecida: `conta` (a pessoa já tinha uma indicação
     * ligada a ela — o caso normal, e o único que sobrevive a troca de
     * aparelho) ou `cookie` (não tinha origem nenhuma e o ciclo anônimo deste
     * navegador, anterior à conta, respondeu). Existe para uma atribuição
     * contestada poder ser explicada.
     */
    resolvidaPor: varchar('resolvida_por', { length: 10 }).notNull(),
    /** Categoria do negócio, no vocabulário que a oportunidade já usa. */
    servicoReferencia: varchar('servico_referencia', { length: 30 }),
    /**
     * O prazo que valia **neste instante**, em dias, copiado de
     * `parceiro_prazos` (ou do padrão global). Congelado: mudar a configuração
     * depois não encurta nem prolonga atribuição que já existe — mesmo
     * princípio de `oportunidades.expira_em`.
     *
     * Nulo só nas linhas gravadas antes desta coluna existir.
     */
    prazoDias: integer('prazo_dias'),
    /** Fim da janela, calculado na criação a partir de `prazo_dias`. */
    expiraEm: timestamp('expira_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma atribuição por negócio — garantia do banco.
    porOportunidadeUnica: uniqueIndex(
      'parceiro_atribuicoes_oportunidade_unica',
    ).on(t.oportunidadeId),
    // O mesmo para a contratação direta: reprocessar não cria a segunda linha.
    porContratacaoUnica: uniqueIndex(
      'parceiro_atribuicoes_contratacao_unica',
    ).on(t.contratacaoId),
    /*
      Toda atribuição nasce de um negócio, e de um só.

      Sem isto, uma linha com as duas origens nulas seria uma atribuição que não
      aponta para negócio nenhum, e uma linha com as duas preenchidas seria dois
      negócios disputando a mesma atribuição. É a mesma trava que `oportunidades`
      usa para manter visibilidade e destinatário coerentes.
    */
    origemUnica: check(
      'parceiro_atribuicoes_origem_unica',
      sql`num_nonnulls(${t.oportunidadeId}, ${t.contratacaoId}) = 1`,
    ),
    // "Quais negócios vieram de mim?", mais recentes primeiro.
    doParceiroIdx: index('parceiro_atribuicoes_parceiro_idx').on(
      t.parceiroId,
      t.createdAt,
    ),
  }),
)
