import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Um plano recorrente contratado **da própria Vincis**.
 *
 * ## Não é contratação direta
 *
 * Nasce do botão "Contratar" de `/precos` — o catálogo da Vincis —, e só dali.
 * O cliente está contratando a plataforma, não um profissional: a conversa
 * "Quanto Ana cobra" (`oportunidades.origem = 'simulacao_preco'`) e o catálogo
 * de serviços dos prestadores (`contratacoes_servico`) continuam sendo acordos
 * entre as duas partes, com o dinheiro fora da Vincis. Por isso esta tabela não
 * aponta para `oportunidades` nem para `contratacoes_servico`: tem identidade
 * própria, e nenhum dos dois caminhos diretos escreve aqui.
 *
 * ## Aceite não é pagamento
 *
 * A linha nasce `aguardando_pagamento` e **fica assim** até existir confirmação
 * real de um gateway — que ainda não existe. Nada nesta fatia a torna `ativa`:
 * nem o aceite, nem o pagamento simulado das oportunidades, nem a passagem do
 * tempo. Por isso a vigência (`vigencia_inicio`/`vigencia_fim`) nasce nula: o
 * contrato só começa a correr quando o dinheiro existir.
 *
 * ## Período comercial não é competência
 *
 * `periodicidade` e `meses` dizem **como o cliente contratou** — mensal, 6 ou 12
 * meses pagos de uma vez. As competências mensais de prestação, que depois
 * sustentam a comissão recorrente do parceiro mês a mês, são outra entidade
 * (`assinatura_competencias`), e por isso não há "próxima competência"
 * aqui: guardar o mesmo estado nos dois lugares faria os dois discordarem.
 *
 * ## O valor daqui é o da oferta aceita
 *
 * `valor_mensal_centavos` e `valor_total_centavos` são o que o cliente aceitou,
 * congelados do motor de preços no instante da contratação. Mudar a tabela
 * pública amanhã não reescreve esta linha. Reajuste futuro não mexe aqui:
 * o valor financeiro definitivo de cada mês será congelado na competência, e é
 * lá que um preço novo entra — esta linha continua dizendo o que foi contratado.
 *
 * ## Profissional depois
 *
 * `prestador_id` nasce nulo: quem executa é a Vincis que decide, depois. Alocar
 * um profissional não muda a identidade do contrato, que é do cliente com a
 * plataforma.
 */
export const assinaturas = pgTable(
  'assinaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** O dono do contrato: a conta da plataforma, nunca a carteira de alguém. */
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    /** O profissional executor, quando a Vincis alocar um. Opcional de propósito. */
    prestadorId: uuid('prestador_id').references(() => usuarios.id),
    /** O serviço do catálogo da Vincis (`precificacao_servicos.codigo`). */
    planoCodigo: varchar('plano_codigo', { length: 30 }).notNull(),
    planoNome: varchar('plano_nome', { length: 160 }).notNull(),
    /** O prazo escolhido, como a tabela de preços o nomeia. */
    periodoCodigo: varchar('periodo_codigo', { length: 30 }).notNull(),
    /** `mensal` | `semestral` | `anual` — a forma comercial do contrato. */
    periodicidade: varchar('periodicidade', { length: 20 }).notNull(),
    /** Quantos meses de prestação o contrato cobre: 1, 6 ou 12. */
    meses: integer('meses').notNull(),
    /** O mensal do plano **antes** do desconto do prazo. */
    valorMensalCheioCentavos: integer('valor_mensal_cheio_centavos').notNull(),
    /** Desconto do prazo, em milésimos. Zero no mensal. */
    descontoMilesimos: integer('desconto_milesimos').notNull(),
    /** O mensal já com o desconto do prazo — o que cada mês vale no contrato. */
    valorMensalCentavos: integer('valor_mensal_centavos').notNull(),
    /** O total do período contratado: mensal com desconto × meses. */
    valorTotalCentavos: integer('valor_total_centavos').notNull(),
    /**
     * O retrato inteiro da oferta aceita.
     *
     * Respostas do configurador, as mesmas perguntas escritas por extenso, a
     * composição que o motor devolveu e o período. É o que permite reconstruir
     * exatamente o que foi contratado quando a tabela pública já tiver mudado.
     */
    oferta: jsonb('oferta').notNull(),
    /** Impressão digital da oferta — a trava do clique duplo. */
    chaveIntencao: varchar('chave_intencao', { length: 64 }).notNull(),
    status: varchar('status', { length: 30 })
      .notNull()
      .default('aguardando_pagamento'),
    /** Quando o cliente confirmou. Não é o início da vigência. */
    contratadoEm: timestamp('contratado_em').defaultNow().notNull(),
    /** Começa quando houver pagamento real. Nulo enquanto aguarda. */
    vigenciaInicio: timestamp('vigencia_inicio'),
    vigenciaFim: timestamp('vigencia_fim'),
    canceladoEm: timestamp('cancelado_em'),
    cancelamentoMotivo: text('cancelamento_motivo'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    /*
      Uma intenção pendente por oferta e por cliente.

      Clique duplo, F5, retry e a volta do login chegam todos com a mesma
      impressão digital — e o banco recusa a segunda linha. Parcial em
      `aguardando_pagamento` porque é exatamente essa a janela da duplicação:
      depois de pago, um segundo contrato igual é outro contrato.
    */
    intencaoPendenteUnica: uniqueIndex('assinaturas_intencao_pendente_unica')
      .on(t.clienteUsuarioId, t.chaveIntencao)
      .where(sql`status = 'aguardando_pagamento'`),
    doClienteIdx: index('assinaturas_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    statusValido: check(
      'assinaturas_status_valido',
      sql`${t.status} in ('aguardando_pagamento', 'ativa', 'cancelada', 'encerrada')`,
    ),
    periodicidadeValida: check(
      'assinaturas_periodicidade_valida',
      sql`${t.periodicidade} in ('mensal', 'semestral', 'anual')`,
    ),
    mesesPositivos: check('assinaturas_meses_positivos', sql`${t.meses} > 0`),
    valoresPositivos: check(
      'assinaturas_valores_positivos',
      sql`${t.valorMensalCentavos} > 0 and ${t.valorMensalCheioCentavos} > 0`,
    ),
    /*
      O total é consequência, não entrada.

      Guardado para leitura, mas amarrado ao mensal e aos meses: um total que
      discordasse deles seria um contrato com dois preços, e é o banco quem
      impede que isso chegue a existir.
    */
    totalCoerente: check(
      'assinaturas_total_coerente',
      sql`${t.valorTotalCentavos} = ${t.valorMensalCentavos} * ${t.meses}`,
    ),
  }),
)
