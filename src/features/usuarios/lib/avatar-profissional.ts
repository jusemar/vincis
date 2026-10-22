import { randomUUID } from 'node:crypto'
import { enviarImagemPublica, removerImagemPublica } from '@/integracoes/armazenamento/imagens-publicas'

/**
 * Upload das imagens públicas do prestador (avatar e foto de destaque).
 *
 * Aqui mora a validação e a chave; **onde** o arquivo vai é decisão de
 * `integracoes/armazenamento` — Vercel Blob público nos ambientes online,
 * disco local no `next dev` (para testes locais nunca tocarem o Blob real).
 * Público porque a foto aparece no perfil público, sem sessão.
 */

export const TAMANHO_MAXIMO_AVATAR = 5 * 1024 * 1024
const TIPOS_AVATAR = new Map([
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/webp', ['webp']],
])

/**
 * As imagens públicas do perfil: `avatar` (foto dos cards) e `destaque` (foto
 * grande do perfil). Mesma validação, pastas separadas no storage — remover
 * uma nunca alcança o arquivo da outra.
 */
export type FinalidadeImagemPerfil = 'avatar' | 'destaque'

export async function enviarAvatarPublico(
  usuarioId: string,
  arquivo: File,
  finalidade: FinalidadeImagemPerfil = 'avatar',
) {
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

  const chave = `perfis-profissionais/${usuarioId}/${finalidade}/${randomUUID()}.${extensao}`
  return enviarImagemPublica(chave, arquivo)
}

/** Recebe a própria URL pública salva (`avatar_url` ou `foto_destaque_url`). */
export async function removerAvatarPublico(url: string) {
  await removerImagemPublica(url)
}
