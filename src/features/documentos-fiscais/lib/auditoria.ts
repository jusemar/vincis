import type {
  MetodoExtracaoFiscal,
  OrigemDocumentoFiscal,
  TipoArquivoFiscal,
  TipoDocumentoFiscal,
} from '../constants/dominio'

/** `entidade` dos eventos de auditoria da Central Fiscal. */
export const ENTIDADES_AUDITORIA_FISCAL = {
  documento: 'documento_fiscal',
  arquivo: 'documento_fiscal_arquivo',
  extracao: 'documento_fiscal_extracao',
} as const

/**
 * O que um evento de auditoria fiscal pode carregar em `metadados`.
 *
 * Lista fechada de propósito. A trilha tem outra regra de acesso e outro prazo
 * de guarda que o documento: repetir nela chave de acesso, CPF/CNPJ das partes,
 * valores, itens ou o XML espalharia dado fiscal e pessoal para onde ele não é
 * protegido. O identificador do documento já vai em `registroAfetado`.
 */
export type MetadadosAuditoriaFiscal = {
  tipoDocumento?: TipoDocumentoFiscal | null
  origem?: OrigemDocumentoFiscal
  metodoExtracao?: MetodoExtracaoFiscal
  /** Nome do provedor externo (ex.: serviço de OCR), nunca credencial. */
  provedor?: string
  versao?: string
  /** Identificador do cliente da perspectiva — nunca nome ou CPF/CNPJ. */
  clienteId?: string | null
  arquivoId?: string
  tipoArquivo?: TipoArquivoFiscal
  extracaoId?: string
  tamanhoBytes?: number
  statusAnterior?: string
  statusNovo?: string
  /** Nomes das colunas alteradas — nunca os valores. */
  camposAlterados?: string[]
}

const CHAVES_PERMITIDAS: readonly (keyof MetadadosAuditoriaFiscal)[] = [
  'tipoDocumento',
  'origem',
  'metodoExtracao',
  'provedor',
  'versao',
  'clienteId',
  'arquivoId',
  'tipoArquivo',
  'extracaoId',
  'tamanhoBytes',
  'statusAnterior',
  'statusNovo',
  'camposAlterados',
]

/**
 * Filtra os metadados antes de gravar. O tipo já recusa chave desconhecida em
 * tempo de compilação; o filtro garante o mesmo em tempo de execução, quando o
 * objeto vem montado de outro lugar (spread de uma linha do banco, por exemplo).
 */
export function metadadosAuditoriaFiscal(
  entrada: MetadadosAuditoriaFiscal,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const chave of CHAVES_PERMITIDAS) {
    if (entrada[chave] !== undefined) saida[chave] = entrada[chave]
  }
  return saida
}
