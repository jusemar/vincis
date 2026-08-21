import { randomUUID } from 'node:crypto'
import {
  TAMANHO_MAXIMO_ANEXO,
  enviarAnexoPrivado,
  extensaoDoArquivo,
  validarAnexoPrivado,
} from '@/lib/anexos-privados'

/**
 * Anexos do Atendimento.
 *
 * A política (tipos aceitos, tamanho, armazenamento privado) mora em
 * `@/lib/anexos-privados` desde que a solicitação de orçamento passou a aceitar
 * arquivos também: uma política, um lugar. Este módulo continua sendo a porta
 * do domínio — o que ele acrescenta é o caminho onde o arquivo do Atendimento
 * é guardado.
 */

export const TAMANHO_MAXIMO_ARQUIVO_ATENDIMENTO = TAMANHO_MAXIMO_ANEXO

export { extensaoDoArquivo }

export function validarArquivoAtendimento(arquivo: File) {
  validarAnexoPrivado(arquivo)
}

export async function enviarArquivoAtendimento(
  atendimentoId: string,
  arquivo: File,
) {
  return enviarAnexoPrivado(
    `atendimentos/${atendimentoId}/arquivos`,
    arquivo,
    randomUUID(),
  )
}
