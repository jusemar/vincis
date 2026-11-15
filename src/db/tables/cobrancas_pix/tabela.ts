import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
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
 * Cobrança Pix real, emitida pela Efí em nome da Vincis.
 *
 * ## O que uma linha aqui significa
 *
 * "A Vincis pediu à Efí que cobrasse X deste Cliente por Y." Não significa
 * contratação, agendamento nem Atendimento: o QR Code existir não prova
 * dinheiro nenhum. O efeito de negócio — contratação do serviço, consultoria
 * agendada, acordo pago, mês de assinatura coberto — só nasce quando a Efí
 * confirma o Pix, e é gravado por quem é dono daquele efeito, na mesma
 * transação que marca esta linha como `paga`.
 *
 * ## Por que uma tabela só para todos os fluxos
 *
 * Porque o que muda entre serviço, consultoria, acordo e plano é *o que o
 * pagamento produz*, e não *como se cobra*. txid, QR Code, expiração, conferência
 * de valor, webhook e reconciliação são idênticos — e duplicá-los em quatro
 * tabelas seria quatro lugares para errar a mesma regra. `finalidade` +
 * `referencia_id` dizem o que está sendo pago; o despacho do efeito vive em
 * `features/pagamentos/lib/efeitos.ts`.
 *
 * ## Recebedor
 *
 * Nesta fase o recebedor é sempre a Vincis (chave Pix da plataforma). Não há
 * split nem repasse automático: `prestador_id` existe para sabermos a quem o
 * serviço pertence e a quem a Vincis repassará depois — não é conta de
 * destino do dinheiro.
 *
 * ## Idempotência no banco
 *
 * - `txid` único: é derivado do id da própria linha, então refazer o `PUT` na
 *   Efí depois de uma queda de rede reencontra a mesma cobrança;
 * - `end_to_end_id` único: o mesmo Pix recebido nunca confirma duas linhas;
 * - uma cobrança **viva** por (finalidade, referência, Cliente): duplo clique,
 *   duas abas e F5 reencontram a mesma, em vez de emitir outra.
 */
export const cobrancasPix = pgTable(
  'cobrancas_pix',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** O que está sendo pago. Ver `FINALIDADES_COBRANCA`. */
    finalidade: varchar('finalidade', { length: 20 }).notNull(),
    /**
     * O registro pago, conforme a finalidade: serviço do catálogo, reserva de
     * consultoria, oportunidade com acordo ou assinatura.
     */
    referenciaId: uuid('referencia_id').notNull(),
    /** Quem paga. Sempre da sessão, nunca da requisição. */
    clienteUsuarioId: uuid('cliente_usuario_id').notNull(),
    /** A quem o serviço pertence. Nulo no plano da própria Vincis. */
    prestadorId: uuid('prestador_id'),
    /** Apurado no servidor a partir do banco. Nunca vindo do navegador. */
    valorCentavos: integer('valor_centavos').notNull(),
    /** Texto curto que aparece no app do banco do pagador. */
    descricao: varchar('descricao', { length: 140 }).notNull(),
    /**
     * Fotografia do que o efeito precisa para acontecer depois — nome e prazo
     * do serviço, mensagem do Cliente, origem de indicação. O efeito roda no
     * webhook, longe da requisição original, e não pode depender de nada que
     * só existia nela.
     */
    contexto: jsonb('contexto').notNull().default({}),
    provedor: varchar('provedor', { length: 20 }).notNull().default('efi'),
    txid: varchar('txid', { length: 35 }).notNull(),
    status: varchar('status', { length: 25 })
      .notNull()
      .default('gerando'),
    pixCopiaECola: text('pix_copia_e_cola'),
    /** Data URL do QR Code devolvido pela Efí. */
    qrCodeImagem: text('qr_code_imagem'),
    /** Validade da cobrança na Efí. Depois disso o Pix não é mais aceito. */
    expiraEm: timestamp('expira_em'),
    /** Identificador do Pix recebido (`endToEndId`), quando houver. */
    endToEndId: varchar('end_to_end_id', { length: 64 }),
    valorPagoCentavos: integer('valor_pago_centavos'),
    pagaEm: timestamp('paga_em'),
    /**
     * O que o pagamento produziu.
     *
     * - `aplicado`: o efeito de negócio existe (contratação, agendamento…);
     * - `conflito`: o dinheiro entrou, mas o efeito não é mais possível —
     *   horário vendido a outro, acordo já pago por outra cobrança. A linha
     *   fica marcada para estorno manual, nunca é ignorada em silêncio.
     */
    efeito: varchar('efeito', { length: 20 }),
    /** Registro produzido pelo efeito: contratação, agendamento, pagamento. */
    efeitoReferenciaId: uuid('efeito_referencia_id'),
    atendimentoId: uuid('atendimento_id'),
    protocolo: varchar('protocolo', { length: 40 }),
    /** Última conferência na Efí — o freio do polling. */
    ultimaConsultaEm: timestamp('ultima_consulta_em'),
    /** Motivo legível de falha. Nunca segredo, nunca resposta crua da Efí. */
    erro: varchar('erro', { length: 300 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    clienteFk: foreignKey({
      columns: [t.clienteUsuarioId],
      foreignColumns: [usuarios.id],
      name: 'cobrancas_pix_cliente_fk',
    }),
    prestadorFk: foreignKey({
      columns: [t.prestadorId],
      foreignColumns: [usuarios.id],
      name: 'cobrancas_pix_prestador_fk',
    }),
    txidUnico: uniqueIndex('cobrancas_pix_txid_unico').on(t.txid),
    endToEndUnico: uniqueIndex('cobrancas_pix_end_to_end_unico')
      .on(t.endToEndId)
      .where(sql`end_to_end_id is not null`),
    /*
      Uma cobrança viva por coisa paga e por Cliente.

      Parcial: depois de paga, expirada ou cancelada, a próxima tentativa é
      outra cobrança — e o banco deixa nascer.
    */
    vivaUnica: uniqueIndex('cobrancas_pix_viva_unica')
      .on(t.finalidade, t.referenciaId, t.clienteUsuarioId)
      .where(sql`status in ('gerando', 'aguardando_pagamento')`),
    /** O caminho da reconciliação: pendentes por validade. */
    pendentesIdx: index('cobrancas_pix_pendentes_idx').on(t.status, t.expiraEm),
    clienteIdx: index('cobrancas_pix_cliente_idx').on(
      t.clienteUsuarioId,
      t.createdAt,
    ),
    referenciaIdx: index('cobrancas_pix_referencia_idx').on(
      t.finalidade,
      t.referenciaId,
    ),
    finalidadeValida: check(
      'cobrancas_pix_finalidade_valida',
      sql`finalidade in ('servico', 'consultoria', 'acordo', 'assinatura')`,
    ),
    statusValido: check(
      'cobrancas_pix_status_valido',
      sql`status in ('gerando', 'aguardando_pagamento', 'paga', 'expirada', 'cancelada', 'falhou')`,
    ),
    efeitoValido: check(
      'cobrancas_pix_efeito_valido',
      sql`efeito is null or efeito in ('aplicado', 'conflito')`,
    ),
    valorPositivo: check('cobrancas_pix_valor_positivo', sql`valor_centavos > 0`),
    /** Paga sempre carrega a prova: o Pix recebido e quando. */
    pagaComprovada: check(
      'cobrancas_pix_paga_comprovada',
      sql`status <> 'paga' or (end_to_end_id is not null and paga_em is not null)`,
    ),
  }),
)
