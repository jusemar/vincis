/**
 * Vocabulário da Central Fiscal.
 *
 * Arquivo puro (sem Drizzle) para que servidor e interface usem as mesmas
 * listas. Cada lista fechada aqui é espelhada por um `check` no banco
 * (`src/db/tables/documentos_fiscais*`); o teste `documentos-fiscais-fundacao`
 * confere que as duas não divergem.
 */

/** Tipos de documento. `outro` cobre o que ainda não tem leitura própria. */
export const TIPOS_DOCUMENTO_FISCAL = ['nfe', 'nfce', 'nfse', 'cte', 'outro'] as const
export type TipoDocumentoFiscal = (typeof TIPOS_DOCUMENTO_FISCAL)[number]

/** Por onde o documento (ou evento) entrou na Vincis. */
export const ORIGENS_DOCUMENTO_FISCAL = [
  'envio_usuario',
  'captura_automatica',
  'integracao',
] as const
export type OrigemDocumentoFiscal = (typeof ORIGENS_DOCUMENTO_FISCAL)[number]

export const STATUS_PROCESSAMENTO_FISCAL = [
  'pendente',
  'processando',
  'processado',
  'falhou',
] as const
export type StatusProcessamentoFiscal = (typeof STATUS_PROCESSAMENTO_FISCAL)[number]

export const STATUS_REVISAO_FISCAL = ['pendente', 'revisado', 'com_divergencia'] as const
export type StatusRevisaoFiscal = (typeof STATUS_REVISAO_FISCAL)[number]

/** Situação na autoridade fiscal, derivada dos eventos conhecidos. */
export const SITUACOES_DOCUMENTO_FISCAL = [
  'nao_verificada',
  'autorizada',
  'cancelada',
  'denegada',
] as const
export type SituacaoDocumentoFiscal = (typeof SITUACOES_DOCUMENTO_FISCAL)[number]

/** Do ponto de vista do contribuinte (cliente ou escritório) dono do documento. */
export const SENTIDOS_DOCUMENTO_FISCAL = ['emitido', 'recebido'] as const
export type SentidoDocumentoFiscal = (typeof SENTIDOS_DOCUMENTO_FISCAL)[number]

export const TIPOS_EVENTO_FISCAL = [
  'autorizacao',
  'denegacao',
  'cancelamento',
  'carta_correcao',
  'ciencia_operacao',
  'confirmacao_recebimento',
  'desconhecimento_operacao',
  'operacao_nao_realizada',
  'outro',
] as const
export type TipoEventoFiscal = (typeof TIPOS_EVENTO_FISCAL)[number]

export const TIPOS_ARQUIVO_FISCAL = ['xml', 'pdf', 'imagem'] as const
export type TipoArquivoFiscal = (typeof TIPOS_ARQUIVO_FISCAL)[number]

export const METODOS_EXTRACAO_FISCAL = ['parser_xml', 'ocr', 'ia', 'manual'] as const
export type MetodoExtracaoFiscal = (typeof METODOS_EXTRACAO_FISCAL)[number]

export const STATUS_EXTRACAO_FISCAL = ['processando', 'concluida', 'falhou'] as const
export type StatusExtracaoFiscal = (typeof STATUS_EXTRACAO_FISCAL)[number]

export const PAPEIS_PARTE_FISCAL = [
  'emitente',
  'destinatario',
  'transportador',
  'prestador',
  'tomador',
  'intermediario',
  'remetente',
  'expedidor',
  'recebedor',
  'autorizado',
  'outro',
] as const
export type PapelParteFiscal = (typeof PAPEIS_PARTE_FISCAL)[number]

export const TIPOS_IDENTIFICACAO_PARTE = ['cnpj', 'cpf', 'estrangeiro'] as const
export type TipoIdentificacaoParte = (typeof TIPOS_IDENTIFICACAO_PARTE)[number]

/**
 * Tributos conhecidos hoje.
 *
 * Diferente das listas acima, esta **não** é fechada no banco: a coluna
 * `documentos_fiscais_tributos.tributo` só exige o formato do código. Tributo
 * novo da Reforma, ou retenção nova, entra aqui sem migration.
 */
export const TRIBUTOS_CONHECIDOS = [
  'icms',
  'icms_st',
  'icms_uf_destino',
  'fcp',
  'fcp_st',
  'ipi',
  'ii',
  'pis',
  'cofins',
  'iss',
  'irrf',
  'csll',
  'inss',
  'ibs',
  'cbs',
  'is',
] as const
export type TributoConhecido = (typeof TRIBUTOS_CONHECIDOS)[number]

/** Formato exigido pelo banco para o código de tributo. */
export const FORMATO_CODIGO_TRIBUTO = /^[a-z][a-z0-9_]*$/

/**
 * CNPJ no formato alfanumérico: 12 posições de letras maiúsculas ou dígitos e
 * 2 dígitos verificadores. O CNPJ numérico de hoje é caso particular.
 */
export const FORMATO_CNPJ = /^[0-9A-Z]{12}[0-9]{2}$/
export const FORMATO_CPF = /^[0-9]{11}$/
