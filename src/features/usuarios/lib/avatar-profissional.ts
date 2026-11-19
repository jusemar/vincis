import { randomUUID } from 'node:crypto'
import { enviarImagemPublica, removerImagemPublica } from '@/integracoes/armazenamento/imagens-publicas'
import { validarImagemEnviada } from '@/lib/validar-imagem-enviada'

/**
 * Upload das imagens públicas do prestador (avatar e foto de destaque).
 *
 * Aqui mora a validação e a chave; **onde** o arquivo vai é decisão de
 * `integracoes/armazenamento` — Vercel Blob público nos ambientes online,
 * disco local no `next dev` (para testes locais nunca tocarem o Blob real).
 * Público porque a foto aparece no perfil público, sem sessão.
 */

export const TAMANHO_MAXIMO_AVATAR = 5 * 1024 * 1024

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
  // Tipo, extensão e assinatura dos bytes — regra única em `src/lib`.
  const extensao = await validarImagemEnviada(arquivo, TAMANHO_MAXIMO_AVATAR)

  const chave = `perfis-profissionais/${usuarioId}/${finalidade}/${randomUUID()}.${extensao}`
  return enviarImagemPublica(chave, arquivo)
}

/** Recebe a própria URL pública salva (`avatar_url` ou `foto_destaque_url`). */
export async function removerAvatarPublico(url: string) {
  await removerImagemPublica(url)
}
