import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { assinaturas } from '../assinaturas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Livro de repasses manuais ao profissional.
 *
 * Uma linha por **origem de dinheiro recebido pela Vincis** que pertence, em
 * parte, a um profissional:
 *
 * - `servico`     → contratação do catálogo paga por Pix (`contratacoes_servico`);
 * - `acordo`      → orçamento aceito e pago por Pix (`oportunidade_pagamentos`);
 * - `consultoria` → consulta paga por Pix (`consultoria_pagamentos`);
 * - `competencia` → mês de plano recorrente da Vincis coberto por Pix
 *   (`assinatura_competencias`).
 *
 * ## Por que um livro, e não só uma consulta
 *
 * A situação (aguardando, disponível, em revisão) é apurada das fontes de
 * verdade — pagamento, prestação, cancelamento — a cada sincronização. O que
 * **não** se apura de novo é o repasse feito: quem registrou, quando, com qual
 * comprovante e qual valor saiu. Esse fato precisa morar numa linha própria,
 * travável, com unicidade por origem: é o que impede repassar duas vezes.
 *
 * ## Valores congelados
 *
 * Bruto, percentual e as duas partes vêm do retrato gravado no momento do Pix
 * (`cobrancas_pix.contexto.comissaoVincis` / colunas `comissao_vincis_*` das
 * tabelas de pagamento). Mudar a configuração depois não reescreve nada. Sem
 * retrato, as colunas ficam nulas e a linha vai para revisão — a Vincis nunca
 * inventa o percentual de um pagamento antigo.
 *
 * A comissão do parceiro indicador sai **somente** da parte da Vincis: a parte
 * do profissional não depende dela. Fica aqui como cópia para leitura.
 */
export const repassesProfissionais = pgTable(
  'repasses_profissionais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    origem: varchar('origem', { length: 20 }).notNull(),
    origemId: uuid('origem_id').notNull(),
    // Nulo só enquanto um plano espera a alocação do contador.
    profissionalId: uuid('profissional_id').references(() => usuarios.id),
    clienteUsuarioId: uuid('cliente_usuario_id')
      .notNull()
      .references(() => usuarios.id),
    assinaturaId: uuid('assinatura_id').references(() => assinaturas.id),
    atendimentoId: uuid('atendimento_id'),
    descricao: varchar('descricao', { length: 200 }).notNull(),
    // txid(s) Efí do dinheiro de origem — a ponte para a conciliação bancária.
    referenciaPagamento: varchar('referencia_pagamento', { length: 200 }),
    pagoEm: timestamp('pago_em'),
    valorBrutoCentavos: integer('valor_bruto_centavos').notNull(),
    comissaoVincisMilesimos: integer('comissao_vincis_milesimos'),
    comissaoVincisCentavos: integer('comissao_vincis_centavos'),
    valorProfissionalCentavos: integer('valor_profissional_centavos'),
    comissaoIndicadorCentavos: integer('comissao_indicador_centavos').notNull().default(0),
    situacao: varchar('situacao', { length: 25 }).notNull().default('aguardando_liberacao'),
    motivoRevisao: varchar('motivo_revisao', { length: 40 }),
    liberadoEm: timestamp('liberado_em'),
    repassadoEm: timestamp('repassado_em'),
    repassadoPorId: uuid('repassado_por_id').references(() => usuarios.id),
    comprovante: varchar('comprovante', { length: 200 }),
    observacao: text('observacao'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // A trava contra repasse duplicado: uma origem, uma linha.
    porOrigemUnica: uniqueIndex('repasses_profissionais_origem_unica').on(t.origem, t.origemId),
    porSituacaoIdx: index('repasses_profissionais_situacao_idx').on(t.situacao, t.createdAt),
    doProfissionalIdx: index('repasses_profissionais_profissional_idx').on(t.profissionalId, t.situacao),
    origemValida: check(
      'repasses_profissionais_origem_valida',
      sql`${t.origem} in ('servico', 'acordo', 'consultoria', 'competencia')`,
    ),
    situacaoValida: check(
      'repasses_profissionais_situacao_valida',
      sql`${t.situacao} in ('aguardando_liberacao', 'disponivel', 'repassado', 'em_revisao')`,
    ),
    brutoPositivo: check('repasses_profissionais_bruto_positivo', sql`${t.valorBrutoCentavos} > 0`),
    indicadorNaoNegativo: check(
      'repasses_profissionais_indicador_nao_negativo',
      sql`${t.comissaoIndicadorCentavos} >= 0`,
    ),
    // As partes fecham em centavos com o bruto — ou não existem (sem retrato).
    divisaoCoerente: check(
      'repasses_profissionais_divisao_coerente',
      sql`(${t.comissaoVincisMilesimos} is null and ${t.comissaoVincisCentavos} is null
            and ${t.valorProfissionalCentavos} is null)
        or (${t.comissaoVincisMilesimos} between 1 and 999
            and ${t.comissaoVincisCentavos} >= 0
            and ${t.valorProfissionalCentavos} >= 0
            and ${t.comissaoVincisCentavos} + ${t.valorProfissionalCentavos} = ${t.valorBrutoCentavos})`,
    ),
    // Repassado exige o fato completo: quem, quando, comprovante, valor e destino.
    repasseCompleto: check(
      'repasses_profissionais_repasse_completo',
      sql`(${t.situacao} = 'repassado') = (${t.repassadoEm} is not null)
        and (${t.situacao} <> 'repassado'
          or (${t.repassadoPorId} is not null and ${t.comprovante} is not null
              and ${t.valorProfissionalCentavos} is not null and ${t.profissionalId} is not null))`,
    ),
    revisaoComMotivo: check(
      'repasses_profissionais_revisao_com_motivo',
      sql`(${t.situacao} = 'em_revisao') = (${t.motivoRevisao} is not null)`,
    ),
  }),
)
