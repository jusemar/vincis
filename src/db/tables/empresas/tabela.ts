import { check, pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { empresaSegmentoEnum, empresaTipoEnum, empresaStatusEnum } from '../../enums'

export const empresas = pgTable(
  'empresas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: varchar('nome', { length: 255 }).notNull(),
    tipo: empresaTipoEnum('tipo').notNull().default('cliente'),
    segmento: empresaSegmentoEnum('segmento'),
    status: empresaStatusEnum('status').notNull().default('ativo'),
    /**
     * Identidade fiscal do próprio escritório, no mesmo formato da de
     * `clientes`. É o contribuinte do documento fiscal que não é de cliente
     * nenhum (`documentos_fiscais.cliente_id` nulo). Nula enquanto não informada.
     */
    tipoIdentificacaoFiscal: varchar('tipo_identificacao_fiscal', { length: 20 }),
    identificacaoFiscal: varchar('identificacao_fiscal', { length: 20 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    identificacaoFiscalCoerente: check(
      'empresas_identificacao_fiscal_coerente',
      sql`(${t.tipoIdentificacaoFiscal} is null) = (${t.identificacaoFiscal} is null)`,
    ),
    identificacaoFiscalValida: check(
      'empresas_identificacao_fiscal_valida',
      sql`${t.tipoIdentificacaoFiscal} is null
        or (${t.tipoIdentificacaoFiscal} = 'cnpj' and ${t.identificacaoFiscal} ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or (${t.tipoIdentificacaoFiscal} = 'cpf' and ${t.identificacaoFiscal} ~ '^[0-9]{11}$')
        or ${t.tipoIdentificacaoFiscal} = 'estrangeiro'`,
    ),
  }),
)
