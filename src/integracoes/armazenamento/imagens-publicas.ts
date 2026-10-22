import { del, put } from '@vercel/blob'
import { PREFIXO_URL_LOCAL, driverArmazenamento } from './config'
import { gravarArquivoLocal, removerArquivoLocal } from './local'

/**
 * Gravação e remoção de imagens públicas, no driver do ambiente.
 *
 * Quem chama (ex.: `features/usuarios/lib/avatar-profissional.ts`) valida o
 * arquivo e monta a chave; aqui só se decide **onde** ele vai.
 *
 * Online, as imagens públicas têm um store **próprio e público**, conectado
 * com o prefixo `IMAGENS_PUBLICAS`. O token é passado explicitamente e nunca
 * cai no `BLOB_READ_WRITE_TOKEN`, que é o store **privado** dos documentos
 * (comprovantes, anexos, documentos fiscais): imagem pública e documento
 * privado nunca dividem store.
 */

const VARIAVEL_TOKEN = 'IMAGENS_PUBLICAS_READ_WRITE_TOKEN'

/** Só URLs de store público do Vercel Blob podem ser removidas por aqui. */
const HOST_BLOB_PUBLICO = '.public.blob.vercel-storage.com'

function tokenImagensPublicas(): string {
  const token = process.env[VARIAVEL_TOKEN]
  if (!token) {
    console.error(`[ARMAZENAMENTO_BLOB] ${VARIAVEL_TOKEN} ausente: store público de imagens não conectado`)
    throw new Error('Armazenamento de imagens indisponível. Tente novamente mais tarde.')
  }
  return token
}

export async function enviarImagemPublica(chave: string, arquivo: File): Promise<{ url: string }> {
  if (driverArmazenamento() === 'local') return gravarArquivoLocal(chave, arquivo)

  const blob = await put(chave, arquivo, {
    access: 'public',
    addRandomSuffix: false,
    contentType: arquivo.type,
    token: tokenImagensPublicas(),
  })
  return { url: blob.url }
}

function ehUrlDoBlobPublico(url: string): boolean {
  try {
    const endereco = new URL(url)
    return endereco.protocol === 'https:' && endereco.hostname.endsWith(HOST_BLOB_PUBLICO)
  } catch {
    return false
  }
}

/**
 * Remove a imagem pela URL salva no banco. Nunca lança: falhar aqui deixa no
 * máximo um arquivo órfão, nunca um perfil apontando para imagem inexistente.
 *
 * Só remove o que pertence ao próprio driver: no local, arquivos locais; no
 * online, URLs de store **público**. Qualquer outra URL (imagem externa,
 * avatar antigo de outro storage, arquivo privado) é preservada — o banco
 * apenas deixa de apontar para ela.
 */
export async function removerImagemPublica(url: string): Promise<void> {
  if (driverArmazenamento() === 'local') {
    const removida = await removerArquivoLocal(url).catch(() => false)
    if (!removida) console.info('[ARMAZENAMENTO_LOCAL] URL externa mantida intacta:', new URL(url, 'http://local').host)
    return
  }
  if (url.startsWith(PREFIXO_URL_LOCAL) || !ehUrlDoBlobPublico(url)) {
    console.info('[ARMAZENAMENTO_BLOB] URL fora do store público mantida intacta:', new URL(url, 'http://local').host)
    return
  }
  try {
    await del(url, { token: tokenImagensPublicas() })
  } catch (erro) {
    console.error('[ARMAZENAMENTO_BLOB] falha ao remover imagem', erro instanceof Error ? erro.message : erro)
  }
}
