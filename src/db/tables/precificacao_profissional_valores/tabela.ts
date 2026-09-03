import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Os números que um Profissional cobra — em edição e no ar, lado a lado.
 *
 * ## Por que uma tabela de valores, e não seis grades espelhadas
 *
 * Copiar `precificacao_precos_base`, `precificacao_faixas` e
 * `precificacao_opcoes` com uma coluna `profissional_id` daria seis tabelas
 * onde a estrutura (limites, códigos, ordem, rótulos) apareceria uma segunda
 * vez — e duas cópias de uma estrutura divergem no primeiro dia em que a Vincis
 * acrescentar uma faixa. Aqui o Profissional grava só o que é dele: **um número
 * por posição da grade**. A posição é identificada por `tipo` + `chave`, e a
 * grade que dá sentido a essas chaves continua sendo a da Vincis.
 *
 * ## `tipo` diz o que a coluna `valor` está contando
 *
 * - `preco_base` — **centavos**. `chave` é o regime (`mei`, `simples`,
 *   `presumido`, `real`).
 * - `faixa` — **centavos**. `chave` é `tipo_da_faixa/codigo`
 *   (`notas_fiscais/11a30`, `funcionarios/excedente`, `faturamento/ate50k`).
 * - `fator` — **milésimos** (o número real × 1000; 1080 = 1,080×). `chave` é
 *   `dimensao/opcao` (`atividade/comercio`, `rotina/vincis`).
 * - `acrescimo_fixo` — **centavos**, mesma `chave` de um `fator`. Existe só
 *   para a opção que cobra um valor em reais em vez de multiplicar o subtotal
 *   ("Híbrido: R$ 20" no lugar de "Híbrido: 12%").
 *
 * ## A linha de `acrescimo_fixo` é opcional, e a ausência dela é a regra
 *
 * Toda opção com acréscimo tem uma linha `fator`; só quem cobra em reais tem
 * **também** uma `acrescimo_fixo`, e é a existência dela que decide qual das
 * duas vale. Duas consequências, e as duas são de propósito: uma configuração
 * gravada antes desta escolha existir continua íntegra e continua cobrando o
 * percentual dela, sem migração de dado nenhuma; e trocar o seletor de volta
 * para % é apagar uma linha, não redigitar um número que já estava certo.
 *
 * É a mesma convenção de unidades da família `precificacao_*`: dinheiro em
 * centavos inteiros, fator em milésimos, nenhuma fração em coluna nenhuma.
 *
 * ## `estado` é a separação entre o que se edita e o que está no ar
 *
 * `rascunho` é o que o Profissional está mexendo; `publicado` é o que o cliente
 * vê. As duas versões convivem na mesma tabela porque publicar é copiar uma
 * sobre a outra dentro de uma transação — e porque a pergunta "o que mudou
 * desde a última publicação?" vira uma comparação, não uma segunda consulta a
 * outro lugar. Enquanto ninguém publica, mexer no rascunho não move um centavo
 * na página pública.
 */
export const precificacaoProfissionalValores = pgTable(
  'precificacao_profissional_valores',
  {
    profissionalId: uuid('profissional_id')
      .notNull()
      .references(() => usuarios.id),
    /** `rascunho` (em edição) ou `publicado` (no ar). */
    estado: varchar('estado', { length: 12 }).notNull(),
    /** `preco_base`, `faixa`, `fator` ou `acrescimo_fixo` — a unidade de `valor`. */
    tipo: varchar('tipo', { length: 20 }).notNull(),
    /** Posição na grade da Vincis. Ver o cabeçalho para o formato de cada tipo. */
    chave: varchar('chave', { length: 80 }).notNull(),
    /** Centavos (`preco_base`, `faixa`, `acrescimo_fixo`) ou milésimos (`fator`). */
    valor: integer('valor').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.profissionalId, t.estado, t.tipo, t.chave],
    }),
    // Toda leitura é "os valores deste profissional neste estado", de uma vez.
    conjuntoIdx: index('precificacao_profissional_valores_conjunto_idx').on(
      t.profissionalId,
      t.estado,
    ),
    estadoConhecido: check(
      'precificacao_profissional_valores_estado_conhecido',
      sql`${t.estado} in ('rascunho', 'publicado')`,
    ),
    tipoConhecido: check(
      'precificacao_profissional_valores_tipo_conhecido',
      sql`${t.tipo} in ('preco_base', 'faixa', 'fator', 'acrescimo_fixo')`,
    ),
    // Zero é preço válido numa faixa (a primeira faixa de notas custa zero), num
    // acréscimo fixo ("100% digital: R$ 0,00") e num preço-base seria um plano
    // de graça — que a conferência comercial recusa antes de publicar. O que o
    // banco impede é o negativo, que chegaria ao cliente como desconto
    // invisível.
    valorNaoNegativo: check(
      'precificacao_profissional_valores_nao_negativo',
      sql`${t.valor} >= 0`,
    ),
    // Um fator zero anularia o preço inteiro; negativo o inverteria. Os dois
    // passariam despercebidos num formulário.
    fatorPositivo: check(
      'precificacao_profissional_valores_fator_positivo',
      sql`${t.tipo} <> 'fator' or ${t.valor} > 0`,
    ),
  }),
)
