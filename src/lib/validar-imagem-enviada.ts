/**
 * Validação de imagem pública enviada pelo navegador (JPG, PNG ou WEBP).
 *
 * Confere três coisas, porque nenhuma sozinha basta: o tipo declarado, a
 * extensão do nome e a **assinatura** dos primeiros bytes — um `.png` que na
 * verdade é HTML ou SVG com script é recusado aqui. Usada pelas fotos do perfil
 * e pelas imagens da Central de Conhecimento.
 */
const TIPOS_IMAGEM = new Map([
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/png', ['png']],
  ['image/webp', ['webp']],
])

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Valida e devolve a extensão normalizada. Lança `Error` com mensagem para o usuário. */
export async function validarImagemEnviada(arquivo: File, tamanhoMaximo: number): Promise<string> {
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const extensoes = TIPOS_IMAGEM.get(arquivo.type)
  if (!extensoes?.includes(extensao)) throw new Error('Envie uma imagem JPG, PNG ou WEBP válida.')
  if (arquivo.size <= 0 || arquivo.size > tamanhoMaximo)
    throw new Error(`A imagem deve ter no máximo ${Math.round(tamanhoMaximo / (1024 * 1024))} MB.`)

  const assinatura = new Uint8Array(await arquivo.slice(0, 12).arrayBuffer())
  const valido =
    arquivo.type === 'image/jpeg'
      ? assinatura[0] === 0xff && assinatura[1] === 0xd8 && assinatura[2] === 0xff
      : arquivo.type === 'image/png'
        ? assinatura.slice(0, 8).every((byte, i) => byte === ASSINATURA_PNG[i])
        : String.fromCharCode(...assinatura.slice(0, 4)) === 'RIFF' &&
          String.fromCharCode(...assinatura.slice(8, 12)) === 'WEBP'
  if (!valido) throw new Error('O conteúdo do arquivo não corresponde ao formato informado.')
  return extensao === 'jpeg' ? 'jpg' : extensao
}
