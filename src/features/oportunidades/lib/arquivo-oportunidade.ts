import { randomUUID } from 'node:crypto'
import { enviarAnexoPrivado, validarAnexoPrivado } from '@/lib/anexos-privados'

/**
 * Anexos da solicitação de orçamento.
 *
 * A política de tipo, tamanho e armazenamento é a compartilhada da plataforma
 * (`@/lib/anexos-privados`) — não existe um segundo sistema de upload. O que
 * este módulo acrescenta é o caminho onde o arquivo da oportunidade mora.
 */

/**
 * Confere o lote inteiro antes de subir qualquer byte.
 *
 * Validar durante o envio deixaria os primeiros arquivos no armazenamento e
 * recusaria o último — o Cliente veria um erro e a solicitação teria metade dos
 * anexos. Aqui, ou o lote todo é aceito, ou nada sobe.
 */
export function validarAnexosDaOportunidade(arquivos: File[]) {
  for (const arquivo of arquivos) validarAnexoPrivado(arquivo)
}

export function enviarAnexoDaOportunidade(
  oportunidadeId: string,
  arquivo: File,
) {
  return enviarAnexoPrivado(
    `oportunidades/${oportunidadeId}/arquivos`,
    arquivo,
    randomUUID(),
  )
}
