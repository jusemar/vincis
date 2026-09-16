/**
 * Vocabulário da interpretação fiscal da NF-e (Fase 1.3).
 *
 * Arquivo puro. Separado de `constants/upload`, que é a barreira de segurança
 * da entrada: aqui começa a leitura fiscal do que aquela barreira já aceitou.
 */
import { NAMESPACE_NFE } from './upload'
import type { TipoDocumentoFiscal } from './dominio'

export { NAMESPACE_NFE }

/**
 * Leiautes que esta versão do parser sabe ler. Versão fora desta lista é erro
 * explícito (`LAYOUT_NAO_SUPORTADO`) — nunca lida como se fosse outra.
 */
export const VERSOES_NFE_SUPORTADAS = ['4.00'] as const
export type VersaoNfeSuportada = (typeof VERSOES_NFE_SUPORTADAS)[number]

/** Raízes de NF-e que a interpretação reconhece, por nome local. */
export const RAIZES_NFE = ['NFe', 'nfeProc'] as const
export type RaizNfe = (typeof RAIZES_NFE)[number]

/** `mod` da nota → tipo de documento da Vincis. */
export const MODELOS_NFE: Record<string, TipoDocumentoFiscal> = {
  '55': 'nfe',
  '65': 'nfce',
}

/** `tpNF`: sentido da operação do ponto de vista do emitente. */
export const TIPOS_OPERACAO_NFE: Record<string, 'entrada' | 'saida'> = {
  '0': 'entrada',
  '1': 'saida',
}

/** `finNFe`. */
export const FINALIDADES_NFE: Record<string, 'normal' | 'complementar' | 'ajuste' | 'devolucao'> = {
  '1': 'normal',
  '2': 'complementar',
  '3': 'ajuste',
  '4': 'devolucao',
}

/** `tpAmb`, tanto da nota quanto do protocolo. */
export const AMBIENTES_NFE: Record<string, 'producao' | 'homologacao'> = {
  '1': 'producao',
  '2': 'homologacao',
}

/**
 * Identidade desta leitura, gravada em `documentos_fiscais_extracoes`
 * (`provedor`/`versao`) quando a fase seguinte persistir a extração. Mudou a
 * interpretação, muda a versão: o mesmo original pode ser relido depois e as
 * duas leituras ficam distinguíveis.
 */
export const PARSER_FISCAL = { provedor: 'vincis', versao: 'nfe-1.0.0' } as const

/** Motivos pelos quais um XML seguro ainda assim não vira documento fiscal. */
export const CODIGOS_ERRO_INTERPRETACAO = [
  'XML_ILEGIVEL',
  'DOCUMENTO_NAO_RECONHECIDO',
  'LAYOUT_NAO_SUPORTADO',
  'ESTRUTURA_ESSENCIAL_AUSENTE',
  'ESTRUTURA_INCONSISTENTE',
  'CONTRATO_INVALIDO',
  'FALHA_INTERPRETACAO',
] as const
export type CodigoErroInterpretacao = (typeof CODIGOS_ERRO_INTERPRETACAO)[number]

/**
 * Mensagens de erro. Nunca citam conteúdo do XML: o caminho do problema (ex.:
 * `infNFe/ide/nNF`) é estrutura do leiaute, não dado do contribuinte.
 */
export const MENSAGENS_ERRO_INTERPRETACAO: Record<CodigoErroInterpretacao, string> = {
  XML_ILEGIVEL: 'Não foi possível ler o XML do documento.',
  DOCUMENTO_NAO_RECONHECIDO: 'O XML não é uma NF-e (NFe ou nfeProc).',
  LAYOUT_NAO_SUPORTADO: 'A versão do leiaute da NF-e ainda não é interpretada pela Vincis.',
  ESTRUTURA_ESSENCIAL_AUSENTE: 'O XML da NF-e está sem uma parte obrigatória do leiaute.',
  ESTRUTURA_INCONSISTENTE: 'O XML da NF-e tem informações que não conferem entre si.',
  CONTRATO_INVALIDO: 'A leitura da NF-e não resultou em um documento fiscal válido.',
  FALHA_INTERPRETACAO: 'Não foi possível interpretar a NF-e.',
}
