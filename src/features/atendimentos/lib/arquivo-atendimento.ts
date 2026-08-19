import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'

export const TAMANHO_MAXIMO_ARQUIVO_ATENDIMENTO = 10 * 1024 * 1024

/**
 * Tipos aceitos no anexo de Atendimento.
 *
 * Lista fechada, casada com a extensão do nome: aceitar qualquer `content-type`
 * enviado pelo navegador transformaria o anexo numa porta de entrada. É a mesma
 * política já usada no comprovante de registro profissional.
 */
const TIPOS_ACEITOS = new Map([
  ['text/plain', ['txt']],
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
])

export function extensaoDoArquivo(nome: string) {
  return nome.split('.').pop()?.toLowerCase() ?? ''
}

export function validarArquivoAtendimento(arquivo: File) {
  const extensoes = TIPOS_ACEITOS.get(arquivo.type)
  if (!extensoes?.includes(extensaoDoArquivo(arquivo.name))) {
    throw new Error('Envie um arquivo TXT, PDF, JPG, JPEG ou PNG válido.')
  }
  if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO_ARQUIVO_ATENDIMENTO) {
    throw new Error('O arquivo deve ter no máximo 10 MB.')
  }
}

/**
 * Sobe o anexo para o armazenamento privado.
 *
 * Mesmo destino dos comprovantes de registro (Vercel Blob com `access:
 * 'private'`): o conteúdo não tem URL pública e só sai por rota autorizada. O
 * banco guarda a chave, nunca o arquivo nem um caminho de disco local.
 */
export async function enviarArquivoAtendimento(
  atendimentoId: string,
  arquivo: File,
) {
  validarArquivoAtendimento(arquivo)
  const extensao = extensaoDoArquivo(arquivo.name)
  const chave = `atendimentos/${atendimentoId}/arquivos/${randomUUID()}.${extensao}`
  const blob = await put(chave, arquivo, {
    access: 'private',
    addRandomSuffix: false,
    contentType: arquivo.type,
  })
  return {
    chave: blob.pathname,
    nome: arquivo.name.slice(0, 255),
    tipoMime: arquivo.type,
    tamanhoBytes: arquivo.size,
  }
}
