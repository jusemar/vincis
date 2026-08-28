import { randomUUID } from 'node:crypto'
import { del, put } from '@vercel/blob'

/**
 * Upload de avatar do prestador — mesmo cliente (`@vercel/blob`) usado pelo
 * comprovante de registro em `comprovante-profissional.ts`, mas `access:
 * 'public'`: a foto aparece no perfil público, então não faz sentido
 * reaproveitar o caminho privado (que existe só para poder auditar/streamar
 * com sessão, coisa que uma imagem pública não precisa).
 */

export const TAMANHO_MAXIMO_AVATAR = 5 * 1024 * 1024
const TIPOS_AVATAR = new Map([
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/webp', ['webp']],
])

export async function enviarAvatarPublico(usuarioId: string, arquivo: File) {
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const extensoes = TIPOS_AVATAR.get(arquivo.type)
  if (!extensoes?.includes(extensao)) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.')
  if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO_AVATAR) throw new Error('A imagem deve ter no máximo 5 MB.')

  const assinatura = new Uint8Array(await arquivo.slice(0, 12).arrayBuffer())
  const valido =
    arquivo.type === 'image/jpeg'
      ? assinatura[0] === 0xff && assinatura[1] === 0xd8 && assinatura[2] === 0xff
      : arquivo.type === 'image/png'
        ? assinatura.slice(0, 8).every((byte, i) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][i])
        : String.fromCharCode(...assinatura.slice(8, 12)) === 'WEBP'
  if (!valido) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.')

  const chave = `perfis-profissionais/${usuarioId}/avatar/${randomUUID()}.${extensao}`
  const blob = await put(chave, arquivo, { access: 'public', addRandomSuffix: false, contentType: arquivo.type })
  return { url: blob.url }
}

/** Recebe a própria URL pública salva em `avatar_url` — é o que `del` aceita. */
export async function removerAvatarPublico(url: string) {
  await del(url).catch(() => undefined)
}
