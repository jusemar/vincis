import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentosFiscaisExtracoes } from '../documentos_fiscais_extracoes/tabela'

/**
 * As partes da operação como estavam **no documento**: emitente, destinatário,
 * transportador, tomador, prestador e as demais.
 *
 * ## Retrato, não cadastro
 *
 * Razão social, inscrições e endereço mudam depois da emissão. O que vale para
 * o documento é o que estava escrito nele, então nada aqui referencia cadastro
 * atual de CNPJ nem `clientes`: é cópia congelada, pertencente à extração que a
 * leu.
 *
 * ## Identificação
 *
 * `tipo_identificacao` diz como ler `identificacao`. O CNPJ é validado no
 * formato alfanumérico (12 posições de letras maiúsculas ou dígitos + 2
 * dígitos verificadores), que também aceita o CNPJ numérico de hoje. O
 * identificador estrangeiro não tem formato fixo.
 *
 * CPF de consumidor é dado pessoal: esta tabela herda a regra de acesso do
 * documento e não deve ser copiada para trilha de auditoria.
 */
export const documentosFiscaisPartes = pgTable(
  'documentos_fiscais_partes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extracaoId: uuid('extracao_id').notNull(),
    papel: varchar('papel', { length: 30 }).notNull(),
    /** Ordem entre partes do mesmo papel (ex.: vários autorizados). */
    sequencia: integer('sequencia').notNull().default(1),
    tipoIdentificacao: varchar('tipo_identificacao', { length: 20 }),
    identificacao: varchar('identificacao', { length: 20 }),
    nome: varchar('nome', { length: 300 }),
    nomeFantasia: varchar('nome_fantasia', { length: 300 }),
    inscricaoEstadual: varchar('inscricao_estadual', { length: 20 }),
    inscricaoMunicipal: varchar('inscricao_municipal', { length: 20 }),
    /** Código de regime tributário como informado no documento. */
    regimeTributario: varchar('regime_tributario', { length: 4 }),
    logradouro: varchar('logradouro', { length: 255 }),
    numero: varchar('numero', { length: 60 }),
    complemento: varchar('complemento', { length: 255 }),
    bairro: varchar('bairro', { length: 120 }),
    /** Código IBGE do município. */
    codigoMunicipio: varchar('codigo_municipio', { length: 7 }),
    municipio: varchar('municipio', { length: 120 }),
    uf: varchar('uf', { length: 2 }),
    cep: varchar('cep', { length: 8 }),
    codigoPais: varchar('codigo_pais', { length: 4 }),
    pais: varchar('pais', { length: 60 }),
    telefone: varchar('telefone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    dadosEspecificos: jsonb('dados_especificos'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    extracaoFk: foreignKey({
      columns: [t.extracaoId],
      foreignColumns: [documentosFiscaisExtracoes.id],
      name: 'documentos_fiscais_partes_extracao_fk',
    }).onDelete('cascade'),
    // Também atende "partes desta extração".
    papelUnico: uniqueIndex('documentos_fiscais_partes_papel_unico').on(
      t.extracaoId,
      t.papel,
      t.sequencia,
    ),
    papelValido: check(
      'documentos_fiscais_partes_papel_valido',
      sql`${t.papel} in ('emitente', 'destinatario', 'transportador', 'prestador', 'tomador',
        'intermediario', 'remetente', 'expedidor', 'recebedor', 'autorizado', 'outro')`,
    ),
    sequenciaPositiva: check(
      'documentos_fiscais_partes_sequencia_positiva',
      sql`${t.sequencia} >= 1`,
    ),
    identificacaoCoerente: check(
      'documentos_fiscais_partes_identificacao_coerente',
      sql`(${t.tipoIdentificacao} is null) = (${t.identificacao} is null)`,
    ),
    identificacaoValida: check(
      'documentos_fiscais_partes_identificacao_valida',
      sql`${t.tipoIdentificacao} is null
        or (${t.tipoIdentificacao} = 'cnpj' and ${t.identificacao} ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or (${t.tipoIdentificacao} = 'cpf' and ${t.identificacao} ~ '^[0-9]{11}$')
        or ${t.tipoIdentificacao} = 'estrangeiro'`,
    ),
  }),
)
