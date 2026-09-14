import { sql } from 'drizzle-orm'
import { check, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { parceiroBonus } from '../parceiro_bonus/tabela'
import { parceiroComissoes } from '../parceiro_comissoes/tabela'
import { parceiroSaques } from '../parceiro_saques/tabela'

/**
 * Quais comissões sustentam um saque.
 *
 * ## Esta tabela é a trava do saldo
 *
 * O índice único em `comissao_id` é o que impede a mesma comissão de pagar dois
 * saques — e, por consequência, o que impede o saldo de ficar negativo. Não é
 * uma consulta antes do insert que garante isso: são duas requisições
 * simultâneas disputando a mesma linha de índice, uma vencendo e a outra
 * recebendo 23505. Validação de tela e leitura prévia evitam o erro comum;
 * só o banco resolve a corrida.
 *
 * ## Parcial, porque saque recusado devolve o dinheiro
 *
 * A trava vale **enquanto a reserva vale**: `where liberado_em is null`. Quando
 * a Gestão recusa um saque, os itens são liberados e a comissão volta a poder
 * entrar num saque novo — sem que a linha desapareça, porque ela é a prova do
 * que aquele saque continha. É o mesmo idioma de
 * `parceiro_indicacoes_ciclo_aberto_unico`: único entre os ativos, preservado
 * no histórico.
 *
 * Um índice incondicional aqui deixaria o dinheiro preso para sempre — o saldo
 * voltaria na conta e o insert do próximo saque falharia com 23505.
 *
 * ## Por que reservar a comissão inteira
 *
 * Uma comissão pertence a um negócio, com valor congelado. Fatiá-la entre dois
 * saques criaria "meia comissão", um conceito que não existe em lugar nenhum do
 * domínio e que precisaria de regra própria de arredondamento. Reservando a
 * linha inteira, a soma dos itens é exatamente o valor do saque, sempre, sem
 * nenhum centavo a explicar.
 *
 * ## O valor viaja junto
 *
 * `valor_centavos` repete o da comissão no instante da reserva. É cópia
 * deliberada: a comissão é imutável depois de gerada, mas o dia em que alguma
 * correção mexer nela, o saque continua valendo o que foi pedido.
 */
export const parceiroSaqueItens = pgTable(
  'parceiro_saque_itens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    saqueId: uuid('saque_id')
      .notNull()
      .references(() => parceiroSaques.id, { onDelete: 'cascade' }),
    /**
     * A origem do dinheiro: uma comissão **ou** um bônus de campanha — nunca os
     * dois, nunca nenhum (`check` abaixo). Sem cascata: é histórico financeiro.
     */
    comissaoId: uuid('comissao_id').references(() => parceiroComissoes.id),
    bonusId: uuid('bonus_id').references(() => parceiroBonus.id),
    valorCentavos: integer('valor_centavos').notNull(),
    /**
     * Quando a reserva deixou de valer.
     *
     * Preenchido ao recusar o saque: a comissão volta ao saldo do parceiro e a
     * linha permanece, contando o que aquele saque continha. Nulo enquanto a
     * reserva está de pé.
     */
    liberadoEm: timestamp('liberado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // Uma comissão paga um saque só — enquanto a reserva estiver de pé.
    porComissaoUnica: uniqueIndex('parceiro_saque_itens_comissao_unica')
      .on(t.comissaoId)
      .where(sql`liberado_em is null`),
    // A mesma trava para o bônus: um bônus paga um saque só.
    porBonusUnico: uniqueIndex('parceiro_saque_itens_bonus_unico')
      .on(t.bonusId)
      .where(sql`liberado_em is null and bonus_id is not null`),
    origemUnica: check(
      'parceiro_saque_itens_origem_unica',
      sql`num_nonnulls(${t.comissaoId}, ${t.bonusId}) = 1`,
    ),
  }),
)
