import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { clientes } from '../clientes/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

/**
 * Um documento fiscal na Central Fiscal: NF-e hoje; NFC-e, NFS-e, CT-e e o que
 * vier depois, pela mesma estrutura.
 *
 * ## Fronteira de isolamento
 *
 * `empresa_id` é o escritório (`empresas`) dono do documento — a mesma fronteira
 * de tenant do resto da Vincis. Nenhuma consulta fiscal existe sem ela, e ela
 * nunca vem da requisição: é resolvida pelo vínculo ativo da sessão
 * (`features/documentos-fiscais/lib/acesso-documentos-fiscais`).
 *
 * `cliente_id` é o contribuinte atendido, quando o documento é de um cliente
 * do escritório. Nulo para documento do próprio escritório. Que o cliente
 * pertença ao escopo da empresa é regra de servidor
 * (`clienteNoEscopoDoEscritorio`), não FK: `clientes.empresa_id` é nulo em
 * clientes cadastrados por membro comum e em clientes antigos.
 *
 * ## Uma linha por perspectiva
 *
 * A mesma NF-e pode ser, dentro do mesmo escritório, a saída do cliente A e a
 * entrada do cliente B. São dois documentos: revisão, classificação e sentido
 * são de cada contribuinte. Por isso a chave de acesso é única por
 * empresa + cliente, e não por empresa.
 *
 * Eventos (cancelamento, CC-e, manifestação) compartilham a chave da nota e
 * **não** moram aqui — vivem em `documentos_fiscais_eventos`, ligados a esta
 * linha. A unicidade da chave não os alcança.
 *
 * ## Cabeçalho vigente, não evidência
 *
 * As colunas descritivas (número, série, emissão, partes, valores) são o resumo
 * da extração vigente, desnormalizado para listar e filtrar sem juntar tabelas.
 * A evidência é o arquivo original (`documentos_fiscais_arquivos`), imutável; a
 * proveniência de cada leitura está em `documentos_fiscais_extracoes`. Reprocessar
 * ou corrigir reescreve este resumo, nunca o original.
 *
 * ## Valores em `numeric`
 *
 * Diferente do resto da Vincis (centavos inteiros): o leiaute fiscal tem
 * totais de até 13 inteiros e casas fixas que `integer` não comporta. O valor
 * é gravado como está no documento, sem arredondamento.
 *
 * ## Identificação das partes
 *
 * `varchar(20)` sem restrição numérica: o CNPJ passa a ser alfanumérico, e a
 * chave de acesso que o contém também. Só maiúsculas e dígitos, sem máscara.
 */
export const documentosFiscais = pgTable(
  'documentos_fiscais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    empresaId: uuid('empresa_id').notNull(),
    clienteId: uuid('cliente_id'),
    /** Quem enviou. Nulo em captura automática. */
    enviadoPorId: uuid('enviado_por_id'),
    /** `nfe`, `nfce`, `nfse`, `cte`, `outro`. Nulo até ser identificado. */
    tipo: varchar('tipo', { length: 20 }),
    origem: varchar('origem', { length: 30 }).notNull(),
    statusProcessamento: varchar('status_processamento', { length: 20 })
      .notNull()
      .default('pendente'),
    statusRevisao: varchar('status_revisao', { length: 20 })
      .notNull()
      .default('pendente'),
    /** Situação na autoridade fiscal, derivada dos eventos conhecidos. */
    situacao: varchar('situacao', { length: 20 }).notNull().default('nao_verificada'),
    /**
     * Emitido pelo contribuinte ou recebido por ele, decidido pela identidade
     * fiscal (`features/documentos-fiscais/lib/identidade-fiscal`).
     * `nao_determinado` é leitura feita sem conseguir decidir — o contribuinte
     * não tem identidade cadastrada, ou nenhuma das partes é ele. Nulo é
     * documento que ainda não foi interpretado.
     */
    sentido: varchar('sentido', { length: 20 }),
    chaveAcesso: varchar('chave_acesso', { length: 60 }),
    /**
     * SHA-256 do arquivo que deu origem ao documento — o mesmo gravado no
     * arquivo original. Repetido aqui porque a perspectiva (empresa + cliente)
     * mora nesta tabela: só assim "o mesmo XML duas vezes para o mesmo
     * contribuinte" é recusado pelo banco, inclusive sob concorrência. Arquivos
     * que chegam depois (eventos) não o alteram. Nulo em documento sem arquivo
     * de origem (captura futura, placeholder de evento).
     */
    sha256Original: varchar('sha256_original', { length: 64 }),
    modelo: varchar('modelo', { length: 4 }),
    serie: varchar('serie', { length: 20 }),
    numero: varchar('numero', { length: 20 }),
    /** Versão do leiaute do documento (ex.: `4.00`). */
    versaoLeiaute: varchar('versao_leiaute', { length: 10 }),
    /** Instante de emissão. */
    emitidoEm: timestamp('emitido_em'),
    /**
     * Dia da emissão como escrito no documento, no fuso do emitente. É o dia
     * que decide competência — converter o instante para outro fuso pode mudar
     * a data.
     */
    dataEmissao: date('data_emissao', { mode: 'string' }),
    emitenteIdentificacao: varchar('emitente_identificacao', { length: 20 }),
    emitenteNome: varchar('emitente_nome', { length: 300 }),
    destinatarioIdentificacao: varchar('destinatario_identificacao', { length: 20 }),
    destinatarioNome: varchar('destinatario_nome', { length: 300 }),
    valorTotal: numeric('valor_total', { precision: 15, scale: 2 }),
    valorProdutos: numeric('valor_produtos', { precision: 15, scale: 2 }),
    valorServicos: numeric('valor_servicos', { precision: 15, scale: 2 }),
    valorDesconto: numeric('valor_desconto', { precision: 15, scale: 2 }),
    valorFrete: numeric('valor_frete', { precision: 15, scale: 2 }),
    valorSeguro: numeric('valor_seguro', { precision: 15, scale: 2 }),
    valorOutrasDespesas: numeric('valor_outras_despesas', { precision: 15, scale: 2 }),
    processadoEm: timestamp('processado_em'),
    revisadoEm: timestamp('revisado_em'),
    revisadoPorId: uuid('revisado_por_id'),
    /** Exclusão lógica: o documento sai das listagens, a evidência fica. */
    excluidoEm: timestamp('excluido_em'),
    excluidoPorId: uuid('excluido_por_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    empresaFk: foreignKey({
      columns: [t.empresaId],
      foreignColumns: [empresas.id],
      name: 'documentos_fiscais_empresa_fk',
    }),
    clienteFk: foreignKey({
      columns: [t.clienteId],
      foreignColumns: [clientes.id],
      name: 'documentos_fiscais_cliente_fk',
    }),
    enviadoPorFk: foreignKey({
      columns: [t.enviadoPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_enviado_por_fk',
    }).onDelete('set null'),
    revisadoPorFk: foreignKey({
      columns: [t.revisadoPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_revisado_por_fk',
    }).onDelete('set null'),
    excluidoPorFk: foreignKey({
      columns: [t.excluidoPorId],
      foreignColumns: [usuarios.id],
      name: 'documentos_fiscais_excluido_por_fk',
    }).onDelete('set null'),
    // Alvo das FKs compostas das tabelas filhas: arquivo de um escritório não
    // aponta para documento de outro — quem impede é o banco.
    idEmpresaUnico: unique('documentos_fiscais_id_empresa_unico').on(t.id, t.empresaId),
    // Mesma chave, mesma perspectiva (empresa + cliente), um documento só.
    // Parcial: documento sem chave ainda não foi lido.
    chaveUnica: uniqueIndex('documentos_fiscais_chave_unica')
      .on(
        t.empresaId,
        t.chaveAcesso,
        sql`coalesce(${t.clienteId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.chaveAcesso} is not null`),
    // Mesmo arquivo, mesma perspectiva, um documento só. Mesma técnica da
    // chave: o `coalesce` faz o documento sem cliente colidir consigo mesmo.
    origemUnica: uniqueIndex('documentos_fiscais_origem_unica')
      .on(
        t.empresaId,
        t.sha256Original,
        sql`coalesce(${t.clienteId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.sha256Original} is not null`),
    // Listagem por período, do escritório e do cliente.
    empresaEmissaoIdx: index('documentos_fiscais_empresa_emissao_idx').on(
      t.empresaId,
      t.dataEmissao,
    ),
    clienteEmissaoIdx: index('documentos_fiscais_cliente_emissao_idx').on(
      t.clienteId,
      t.dataEmissao,
    ),
    // Fila de revisão do escritório.
    empresaRevisaoIdx: index('documentos_fiscais_empresa_revisao_idx').on(
      t.empresaId,
      t.statusRevisao,
    ),
    // Fila de processamento (pendentes e em andamento), do mais antigo.
    processamentoIdx: index('documentos_fiscais_processamento_idx')
      .on(t.statusProcessamento, t.createdAt)
      .where(sql`${t.statusProcessamento} in ('pendente', 'processando')`),
    emitenteIdx: index('documentos_fiscais_emitente_idx').on(
      t.empresaId,
      t.emitenteIdentificacao,
    ),
    destinatarioIdx: index('documentos_fiscais_destinatario_idx').on(
      t.empresaId,
      t.destinatarioIdentificacao,
    ),
    tipoValido: check(
      'documentos_fiscais_tipo_valido',
      sql`${t.tipo} is null or ${t.tipo} in ('nfe', 'nfce', 'nfse', 'cte', 'outro')`,
    ),
    origemValida: check(
      'documentos_fiscais_origem_valida',
      sql`${t.origem} in ('envio_usuario', 'captura_automatica', 'integracao')`,
    ),
    statusProcessamentoValido: check(
      'documentos_fiscais_status_processamento_valido',
      sql`${t.statusProcessamento} in ('pendente', 'processando', 'processado', 'falhou')`,
    ),
    statusRevisaoValido: check(
      'documentos_fiscais_status_revisao_valido',
      sql`${t.statusRevisao} in ('pendente', 'revisado', 'com_divergencia')`,
    ),
    situacaoValida: check(
      'documentos_fiscais_situacao_valida',
      sql`${t.situacao} in ('nao_verificada', 'autorizada', 'cancelada', 'denegada')`,
    ),
    sentidoValido: check(
      'documentos_fiscais_sentido_valido',
      sql`${t.sentido} is null or ${t.sentido} in ('emitido', 'recebido', 'nao_determinado')`,
    ),
    sha256OriginalFormato: check(
      'documentos_fiscais_sha256_original_formato',
      sql`${t.sha256Original} is null or ${t.sha256Original} ~ '^[0-9a-f]{64}$'`,
    ),
    chaveFormato: check(
      'documentos_fiscais_chave_formato',
      sql`${t.chaveAcesso} is null or ${t.chaveAcesso} ~ '^[0-9A-Z]+$'`,
    ),
    // Documento processado sabe o que é e quando foi lido.
    processamentoCoerente: check(
      'documentos_fiscais_processamento_coerente',
      sql`${t.statusProcessamento} <> 'processado'
        or (${t.tipo} is not null and ${t.processadoEm} is not null)`,
    ),
    revisaoCoerente: check(
      'documentos_fiscais_revisao_coerente',
      sql`(${t.statusRevisao} = 'pendente') = (${t.revisadoEm} is null)`,
    ),
    valoresNaoNegativos: check(
      'documentos_fiscais_valores_nao_negativos',
      sql`coalesce(${t.valorTotal}, 0) >= 0
        and coalesce(${t.valorProdutos}, 0) >= 0
        and coalesce(${t.valorServicos}, 0) >= 0
        and coalesce(${t.valorDesconto}, 0) >= 0
        and coalesce(${t.valorFrete}, 0) >= 0
        and coalesce(${t.valorSeguro}, 0) >= 0
        and coalesce(${t.valorOutrasDespesas}, 0) >= 0`,
    ),
  }),
)
