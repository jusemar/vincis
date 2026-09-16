/**
 * Limites das ações em lote da Central Fiscal.
 *
 * Arquivo puro: a tela mostra e respeita os mesmos números que o servidor
 * aplica. Uma ação em lote é **uma requisição síncrona** — não há fila nem
 * worker nesta etapa —, então cada limite é o que cabe com folga no tempo de
 * uma Server Action.
 *
 * - **Revisão (100)**: cada documento é uma checagem de autorização e um
 *   `update` curto. Cem cabe de sobra e cobre mais de uma página da listagem.
 * - **Reprocessamento (20)**: cada documento relê o XML original do
 *   armazenamento privado, passa pela barreira de segurança, roda o parser e
 *   grava uma extração nova numa transação. É a ação mais cara da Central, e
 *   vinte mantém a requisição previsível sem inventar infraestrutura.
 */
export const LIMITE_REVISAO_EM_LOTE = 100
export const LIMITE_REPROCESSAMENTO_EM_LOTE = 20

/**
 * Classificação visual de pendência, derivada dos estados que já existem — sem
 * status novo no banco.
 *
 * "Precisa de atenção" é o documento que não foi interpretado, o que ficou sem
 * sentido determinado ou o que ainda espera revisão humana.
 */
export function precisaDeAtencao(documento: {
  statusProcessamento: string
  statusRevisao: string
  sentido: string | null
}): boolean {
  return (
    documento.statusProcessamento === 'falhou' ||
    documento.sentido === null ||
    documento.sentido === 'nao_determinado' ||
    documento.statusRevisao === 'pendente'
  )
}

/** Ordens aceitas pela listagem. A primeira é o padrão. */
export const ORDENS_DOCUMENTOS_FISCAIS = [
  'emissao_desc',
  'emissao_asc',
  'importacao_desc',
  'valor_desc',
  'valor_asc',
] as const
export type OrdemDocumentosFiscais = (typeof ORDENS_DOCUMENTOS_FISCAIS)[number]

export const ROTULOS_ORDEM_DOCUMENTOS: Record<OrdemDocumentosFiscais, string> = {
  emissao_desc: 'Emissão mais recente',
  emissao_asc: 'Emissão mais antiga',
  importacao_desc: 'Importação mais recente',
  valor_desc: 'Maior valor',
  valor_asc: 'Menor valor',
}
