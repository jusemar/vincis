import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { usuarios } from '../usuarios/tabela'

/**
 * Uma campanha do Programa de Parceiros: meta, período e recompensa.
 *
 * ## Incentivo, não comissão
 *
 * Campanha não mexe em percentual de comissão nem em nível. É um incentivo
 * temporário: quem atinge a meta no período ganha bônus em dinheiro, pontos,
 * ou os dois. Tudo aqui é configurado pela Gestão — tipo de meta, alvo,
 * período e recompensa.
 *
 * ## Publicada é congelada
 *
 * `rascunho` pode ser editado à vontade. `publicada` não: a regra que o
 * parceiro está perseguindo não muda no meio do caminho — mudança material é
 * campanha nova. O único movimento depois de publicar é cancelar, e só enquanto
 * ninguém ganhou a recompensa.
 *
 * Agendada, ativa e encerrada não são colunas: saem de `status = 'publicada'`
 * comparado com a data de hoje em São Paulo.
 *
 * ## Período em datas locais
 *
 * `inicio` e `fim` são dias do calendário brasileiro, inclusive nas duas pontas.
 * Um evento conta se o dia dele, em São Paulo, cai no período — o fuso do
 * navegador de ninguém decide dinheiro.
 *
 * `alvo` é na unidade do tipo: clientes, serviços ou centavos.
 */
export const parceiroCampanhas = pgTable(
  'parceiro_campanhas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titulo: varchar('titulo', { length: 120 }).notNull(),
    descricao: varchar('descricao', { length: 280 }).notNull().default(''),
    tipoMeta: varchar('tipo_meta', { length: 40 }).notNull(),
    alvo: integer('alvo').notNull(),
    bonusCentavos: integer('bonus_centavos').notNull().default(0),
    pontos: integer('pontos').notNull().default(0),
    inicio: date('inicio', { mode: 'string' }).notNull(),
    fim: date('fim', { mode: 'string' }).notNull(),
    /** Quem participa. Nesta versão, todos os parceiros ativos. */
    escopo: varchar('escopo', { length: 20 }).notNull().default('todos'),
    status: varchar('status', { length: 20 }).notNull().default('rascunho'),
    criadaPor: uuid('criada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    publicadaEm: timestamp('publicada_em'),
    publicadaPor: uuid('publicada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    canceladaEm: timestamp('cancelada_em'),
    canceladaPor: uuid('cancelada_por').references(() => usuarios.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    porStatusIdx: index('parceiro_campanhas_status_idx').on(t.status, t.inicio, t.fim),
    // Só os tipos com motor. Progressiva e combinada não passam nem pelo banco.
    tipoValido: check(
      'parceiro_campanhas_tipo_valido',
      sql`${t.tipoMeta} in ('novos_clientes_recorrentes', 'servicos_avulsos', 'valor_gerado')`,
    ),
    alvoPositivo: check('parceiro_campanhas_alvo_positivo', sql`${t.alvo} > 0`),
    recompensaValida: check(
      'parceiro_campanhas_recompensa_valida',
      sql`${t.bonusCentavos} >= 0 and ${t.pontos} >= 0 and (${t.bonusCentavos} > 0 or ${t.pontos} > 0)`,
    ),
    periodoValido: check('parceiro_campanhas_periodo_valido', sql`${t.fim} >= ${t.inicio}`),
    escopoValido: check('parceiro_campanhas_escopo_valido', sql`${t.escopo} in ('todos')`),
    statusValido: check(
      'parceiro_campanhas_status_valido',
      sql`${t.status} in ('rascunho', 'publicada', 'cancelada')`,
    ),
    publicacaoCoerente: check(
      'parceiro_campanhas_publicacao_coerente',
      sql`(${t.status} = 'rascunho' and ${t.publicadaEm} is null and ${t.canceladaEm} is null)
        or (${t.status} = 'publicada' and ${t.publicadaEm} is not null and ${t.canceladaEm} is null)
        or (${t.status} = 'cancelada' and ${t.canceladaEm} is not null)`,
    ),
  }),
)
