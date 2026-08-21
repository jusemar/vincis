import type { AnexoOportunidadeDTO } from '../types/oportunidade'

/**
 * Monta a rota de download de um anexo.
 *
 * A URL é sempre a da rota autorizada — o caminho no armazenamento privado
 * nunca sai do servidor. Fica numa função só para que as duas telas (Cliente e
 * prestador) não montem a string por conta própria e divirjam.
 */
export function rotaDoAnexo(oportunidadeId: string, arquivoId: string) {
  return `/api/oportunidades/${oportunidadeId}/arquivos/${arquivoId}`
}

export function montarAnexo(
  oportunidadeId: string,
  arquivo: {
    id: string
    nome: string
    tipoMime: string
    tamanhoBytes: number
  },
): AnexoOportunidadeDTO {
  return {
    id: arquivo.id,
    nome: arquivo.nome,
    tipoMime: arquivo.tipoMime,
    tamanhoBytes: arquivo.tamanhoBytes,
    url: rotaDoAnexo(oportunidadeId, arquivo.id),
  }
}
