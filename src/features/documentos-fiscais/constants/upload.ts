/**
 * Política de recebimento de XML fiscal (Fase 1.2).
 *
 * Arquivo puro: a interface futura mostra — e usa para dividir os envios — os
 * mesmos limites que o servidor aplica. Esta é a **única** fonte desses números.
 *
 * ## Por que estes números
 *
 * Um lote é **uma requisição**. Os três limites valem juntos, e o que manda é o
 * da requisição — nunca `quantidade × tamanho por arquivo`:
 *
 * - **Requisição inteira: 4 MB** (`TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL`). O
 *   corpo de uma função na Vercel é limitado a 4,5 MB; ficamos ~300 KB abaixo,
 *   para não depender da conta exata da plataforma.
 * - **Soma dos arquivos do lote: 3,5 MB** (`TAMANHO_MAXIMO_LOTE_XML_FISCAL`) —
 *   a requisição menos 512 KB de envelope multipart (fronteiras, cabeçalhos de
 *   cada parte, nomes de arquivo, `clienteId`). Um lote de 50 arquivos com
 *   nomes longos gasta bem menos que isso; o teste mede.
 * - **3 MB por arquivo**: uma NF-e comum tem dezenas de KB; a maior possível
 *   (990 itens) fica perto de 2 MB. Acima disso não é NF-e individual.
 * - **50 arquivos por lote**: cada arquivo é validado e gravado
 *   individualmente; o teto mantém memória e tempo de uma requisição previsíveis.
 *
 * Volumes maiores (100, 300 XMLs) não sobem numa requisição só: quem envia
 * divide em lotes que respeitem `excedeLimitesDoLote`, cada lote tem resultado
 * próprio e quem envia consolida — sem fila nem upload direto ao storage.
 */
export const LIMITE_CORPO_PLATAFORMA = 4_500_000
export const TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL = 4 * 1024 * 1024
export const FOLGA_ENVELOPE_LOTE = 512 * 1024
export const TAMANHO_MAXIMO_LOTE_XML_FISCAL = TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL - FOLGA_ENVELOPE_LOTE
export const TAMANHO_MAXIMO_XML_FISCAL = 3 * 1024 * 1024
export const QUANTIDADE_MAXIMA_LOTE_XML_FISCAL = 50

/**
 * Se o lote passa da quantidade ou da soma real dos tamanhos. Não olha
 * conteúdo: serve antes de ler qualquer byte dos arquivos. O limite de cada
 * arquivo é resultado daquele arquivo, não do lote.
 */
export function excedeLimitesDoLote(arquivos: readonly { size: number }[]): boolean {
  if (arquivos.length > QUANTIDADE_MAXIMA_LOTE_XML_FISCAL) return true
  let total = 0
  for (const { size } of arquivos) total += size
  return total > TAMANHO_MAXIMO_LOTE_XML_FISCAL
}

/**
 * Divide uma seleção grande em lotes que cabem numa requisição.
 *
 * É a contrapartida de `excedeLimitesDoLote` para quem envia: 300 XMLs viram
 * vários lotes seguros, cada um com resultado próprio, sem nenhuma requisição
 * gigante. Arquivo individual acima do teto não é dividido — isso é resultado
 * dele, não do lote.
 */
export function dividirEmLotesDeUpload<T extends { size: number }>(arquivos: readonly T[]): T[][] {
  const lotes: T[][] = []
  let atual: T[] = []
  for (const arquivo of arquivos) {
    if (atual.length > 0 && excedeLimitesDoLote([...atual, arquivo])) {
      lotes.push(atual)
      atual = []
    }
    atual.push(arquivo)
  }
  if (atual.length > 0) lotes.push(atual)
  return lotes
}

/** `3670016` → `3,5 MB`. Mensagens derivam dos limites, nunca os repetem. */
function emMegabytes(bytes: number) {
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace('.', ',')} MB`
}

/** Quantos arquivos do lote são gravados ao mesmo tempo. */
export const CONCORRENCIA_LOTE_XML_FISCAL = 4

/**
 * MIME declarados pelo navegador que aceitamos para `.xml`. Vazio entra porque
 * alguns sistemas não informam tipo para XML; a decisão real vem do conteúdo.
 * O MIME gravado e servido é sempre `application/xml`, nunca o declarado.
 */
export const MIMES_ACEITOS_XML = ['application/xml', 'text/xml', ''] as const
export const MIME_XML_FISCAL = 'application/xml'

/**
 * Raízes de NF-e/NFC-e aceitas nesta fase, no namespace do Portal Fiscal. Só
 * decidem se o arquivo entra; versão e layout são do parser fiscal.
 */
export const NAMESPACE_NFE = 'http://www.portalfiscal.inf.br/nfe'
export const RAIZES_XML_ACEITAS = ['nfeProc', 'NFe'] as const

/** Limites estruturais do XML: muito acima de qualquer NF-e real. */
export const PROFUNDIDADE_MAXIMA_XML = 64
export const ATRIBUTOS_MAXIMOS_POR_ELEMENTO = 64

/** Recusas do lote inteiro — nada foi lido nem gravado. */
export const CODIGOS_RECUSA_LOTE = [
  'SEM_AUTENTICACAO',
  'SEM_PERMISSAO',
  'CLIENTE_FORA_DO_ESCOPO',
  'CLIENTE_OBRIGATORIO',
  'LOTE_VAZIO',
  'LOTE_MUITO_GRANDE',
  'REQUISICAO_INVALIDA',
] as const
export type CodigoRecusaLote = (typeof CODIGOS_RECUSA_LOTE)[number]

/** Resultado de cada arquivo do lote. */
export const CODIGOS_RESULTADO_ARQUIVO = [
  'ACEITO',
  'DOCUMENTO_DUPLICADO',
  'ARQUIVO_DUPLICADO',
  'DOCUMENTO_NAO_INTERPRETADO',
  'ARQUIVO_NAO_PERMITIDO',
  'ARQUIVO_VAZIO',
  'ARQUIVO_MUITO_GRANDE',
  'XML_INVALIDO',
  'XML_INSEGURO',
  'XML_NAO_SUPORTADO',
  'FALHA_ARMAZENAMENTO',
  'FALHA_REGISTRO',
] as const
export type CodigoResultadoArquivo = (typeof CODIGOS_RESULTADO_ARQUIVO)[number]
/** Códigos que descrevem um documento gravado — não uma recusa do arquivo. */
export const CODIGOS_COM_DOCUMENTO = [
  'ACEITO',
  'DOCUMENTO_DUPLICADO',
  'ARQUIVO_DUPLICADO',
  'DOCUMENTO_NAO_INTERPRETADO',
] as const

/**
 * As duas formas de repetição, distintas por dentro e iguais para quem envia:
 * `ARQUIVO_DUPLICADO` é o mesmo arquivo de novo (mesmo SHA-256);
 * `DOCUMENTO_DUPLICADO` é a mesma NF-e (mesma chave de acesso) em outro arquivo.
 */
export const CODIGOS_DUPLICIDADE = ['DOCUMENTO_DUPLICADO', 'ARQUIVO_DUPLICADO'] as const
export type CodigoRecusaArquivo = Exclude<CodigoResultadoArquivo, (typeof CODIGOS_COM_DOCUMENTO)[number]>

export const MENSAGENS_UPLOAD_FISCAL: Record<CodigoRecusaLote | CodigoResultadoArquivo, string> = {
  SEM_AUTENTICACAO: 'Sua sessão expirou. Entre novamente para enviar documentos.',
  SEM_PERMISSAO: 'Você não tem autorização para enviar documentos fiscais neste escritório.',
  CLIENTE_FORA_DO_ESCOPO: 'O cliente informado não está disponível para você neste escritório.',
  CLIENTE_OBRIGATORIO: 'Escolha o cliente ao qual os documentos pertencem.',
  LOTE_VAZIO: 'Selecione ao menos um arquivo XML.',
  LOTE_MUITO_GRANDE: `Envie no máximo ${QUANTIDADE_MAXIMA_LOTE_XML_FISCAL} arquivos e ${emMegabytes(TAMANHO_MAXIMO_LOTE_XML_FISCAL)} por vez.`,
  REQUISICAO_INVALIDA: 'Não foi possível ler o envio. Tente novamente.',
  ACEITO: 'Documento importado e pronto para revisão.',
  DOCUMENTO_DUPLICADO: 'Este documento já foi importado para este contribuinte.',
  ARQUIVO_DUPLICADO: 'Este arquivo já foi importado para este contribuinte.',
  DOCUMENTO_NAO_INTERPRETADO:
    'O arquivo foi guardado, mas a NF-e ainda não pôde ser interpretada. Nenhum dado fiscal foi registrado.',
  ARQUIVO_NAO_PERMITIDO: 'Envie somente arquivos XML de NF-e.',
  ARQUIVO_VAZIO: 'O arquivo está vazio.',
  ARQUIVO_MUITO_GRANDE: `O arquivo XML deve ter no máximo ${emMegabytes(TAMANHO_MAXIMO_XML_FISCAL)}.`,
  XML_INVALIDO: 'O conteúdo não é um XML válido.',
  XML_INSEGURO: 'O XML contém declarações não permitidas (DTD, entidades ou instruções).',
  XML_NAO_SUPORTADO: 'O XML não é uma NF-e. Nesta etapa só NF-e e NFC-e são aceitas.',
  FALHA_ARMAZENAMENTO: 'Não foi possível guardar o arquivo. Tente enviá-lo novamente.',
  FALHA_REGISTRO: 'Não foi possível registrar o documento. Tente enviá-lo novamente.',
}
