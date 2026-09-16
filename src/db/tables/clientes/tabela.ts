import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const clientes = pgTable(
  'clientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: varchar('codigo', { length: 20 })
      .notNull()
      .unique()
      .default(sql`'CLI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))`),
    profissionalId: uuid('profissional_id')
      .notNull()
      .references(() => usuarios.id),
    empresaId: uuid('empresa_id').references(() => empresas.id),
    // Conta do Cliente na plataforma, quando existir. Preenchido apenas por
    // referência explícita (contratação feita pela sessão do próprio Cliente) —
    // nunca por coincidência de e-mail ou telefone, que juntaria pessoas
    // diferentes em silêncio. Nulo para cliente cadastrado à mão pelo prestador.
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    telefone: varchar('telefone', { length: 20 }).notNull(),
    empresaNome: varchar('empresa_nome', { length: 255 }),
    /**
     * Identidade fiscal do contribuinte atendido — o que liga uma NF-e a ele.
     * `tipo_identificacao_fiscal` diz como ler o valor (`cnpj`, `cpf`,
     * `estrangeiro`), no mesmo vocabulário de `documentos_fiscais_partes`. Sem
     * máscara e sem restrição numérica: o CNPJ passa a ser alfanumérico. Nulo
     * enquanto o cadastro não informar — e sem ela a Central Fiscal não deduz
     * sentido nenhum por nome, e-mail ou telefone.
     */
    tipoIdentificacaoFiscal: varchar('tipo_identificacao_fiscal', { length: 20 }),
    identificacaoFiscal: varchar('identificacao_fiscal', { length: 20 }),
    area: varchar('area', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('ativo'),
    tipoAtendimento: varchar('tipo_atendimento', { length: 20 })
      .notNull()
      .default('mensal'),
    valorReferenciaCentavos: integer('valor_referencia_centavos')
      .notNull()
      .default(0),
    observacoes: text('observacoes'),
    cep: varchar('cep', { length: 8 }),
    logradouro: varchar('logradouro', { length: 255 }),
    numero: varchar('numero', { length: 30 }),
    complemento: varchar('complemento', { length: 120 }),
    bairro: varchar('bairro', { length: 120 }),
    cidade: varchar('cidade', { length: 120 }),
    estado: varchar('estado', { length: 2 }),
    arquivadoEm: timestamp('arquivado_em'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    profissionalStatusIdx: index('clientes_profissional_status_idx').on(
      t.profissionalId,
      t.status,
    ),
    profissionalCriacaoIdx: index('clientes_profissional_criacao_idx').on(
      t.profissionalId,
      t.createdAt,
    ),
    empresaIdx: index('clientes_empresa_idx').on(t.empresaId),
    // "De quem é esta NF-e?" no escritório, sem varrer a tabela.
    identificacaoFiscalIdx: index('clientes_identificacao_fiscal_idx').on(
      t.empresaId,
      t.identificacaoFiscal,
    ),
    identificacaoFiscalCoerente: check(
      'clientes_identificacao_fiscal_coerente',
      sql`(${t.tipoIdentificacaoFiscal} is null) = (${t.identificacaoFiscal} is null)`,
    ),
    identificacaoFiscalValida: check(
      'clientes_identificacao_fiscal_valida',
      sql`${t.tipoIdentificacaoFiscal} is null
        or (${t.tipoIdentificacaoFiscal} = 'cnpj' and ${t.identificacaoFiscal} ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or (${t.tipoIdentificacaoFiscal} = 'cpf' and ${t.identificacaoFiscal} ~ '^[0-9]{11}$')
        or ${t.tipoIdentificacaoFiscal} = 'estrangeiro'`,
    ),
  }),
)
