import { randomUUID } from 'node:crypto'
import { del, get, put } from '@vercel/blob'

export const TAMANHO_MAXIMO_COMPROVANTE = 5 * 1024 * 1024
const TIPOS = new Map([
  ['application/pdf', ['pdf']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
])

export async function enviarComprovantePrivado(usuarioId: string, arquivo: File) {
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const extensoes = TIPOS.get(arquivo.type)
  if (!extensoes?.includes(extensao)) throw new Error('Envie um arquivo PDF, JPG, JPEG ou PNG válido.')
  if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) throw new Error('O comprovante deve ter no máximo 5 MB.')

  const assinatura = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer())
  const valido = arquivo.type === 'application/pdf'
    ? String.fromCharCode(...assinatura.slice(0, 4)) === '%PDF'
    : arquivo.type === 'image/jpeg'
      ? assinatura[0] === 0xff && assinatura[1] === 0xd8 && assinatura[2] === 0xff
      : assinatura.slice(0, 8).every((byte, i) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][i])
  if (!valido) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.')

  const chave = `perfis-profissionais/${usuarioId}/comprovantes/${randomUUID()}.${extensao}`
  const blob = await put(chave, arquivo, { access: 'private', addRandomSuffix: false, contentType: arquivo.type })
  return { chave: blob.pathname, nomeOriginal: arquivo.name.slice(0, 255), tipo: arquivo.type, tamanho: arquivo.size, enviadoEm: new Date() }
}

export async function removerComprovantePrivado(chave: string) {
  await del(chave)
}

export async function removerComprovanteComCompensacao(chave: string) {
  const atual = await get(chave, { access: 'private', useCache: false })
  if (!atual || atual.statusCode !== 200) throw new Error('O comprovante privado não pôde ser recuperado para exclusão segura.')
  const conteudo = await new Response(atual.stream).arrayBuffer()
  const tipo = atual.blob.contentType
  await del(chave)
  return async () => {
    await put(chave, conteudo, { access: 'private', addRandomSuffix: false, contentType: tipo })
  }
}
