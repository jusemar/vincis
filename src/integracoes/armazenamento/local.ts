import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PREFIXO_URL_LOCAL, pastaArmazenamentoLocal } from './config'

/**
 * Driver local: grava no disco da máquina de desenvolvimento.
 *
 * A URL salva no banco é relativa (`/api/armazenamento-local/<chave>`), então
 * a imagem continua aparecendo depois do refresh enquanto o arquivo existir na
 * pasta local. Nenhuma chamada de rede acontece aqui.
 *
 * Os `turbopackIgnore` nos caminhos dinâmicos evitam que o build rastreie o
 * projeto inteiro como dependência (aviso "unexpected file in NFT list").
 */

const TIPOS_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Converte a chave em caminho absoluto dentro da pasta local, ou `null`.
 *
 * A chave chega da URL na leitura, então é tratada como entrada hostil:
 * segmentos vazios, `.`/`..` e qualquer coisa que escape da pasta são
 * recusados — sem isso, `/api/armazenamento-local/../../.env` leria segredos.
 */
export function caminhoLocalSeguro(chave: string): string | null {
  const segmentos = chave.split('/')
  if (!segmentos.length || segmentos.some((s) => !s || s === '.' || s === '..' || s.includes('\\'))) {
    return null
  }
  const base = path.resolve(/*turbopackIgnore: true*/ pastaArmazenamentoLocal())
  const destino = path.resolve(/*turbopackIgnore: true*/ base, ...segmentos)
  return destino.startsWith(base + path.sep) ? destino : null
}

export function tipoDoArquivoLocal(chave: string): string | null {
  return TIPOS_POR_EXTENSAO[chave.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

export async function gravarArquivoLocal(chave: string, arquivo: File): Promise<{ url: string }> {
  const destino = caminhoLocalSeguro(chave)
  if (!destino || !tipoDoArquivoLocal(chave)) throw new Error('Chave de arquivo inválida.')

  await mkdir(path.dirname(/*turbopackIgnore: true*/ destino), { recursive: true })
  await writeFile(/*turbopackIgnore: true*/ destino, Buffer.from(await arquivo.arrayBuffer()))
  console.info('[ARMAZENAMENTO_LOCAL] gravado', chave)
  return { url: `${PREFIXO_URL_LOCAL}${chave}` }
}

/** Remove só URLs do próprio driver local; qualquer outra é ignorada. */
export async function removerArquivoLocal(url: string): Promise<boolean> {
  if (!url.startsWith(PREFIXO_URL_LOCAL)) return false
  const destino = caminhoLocalSeguro(url.slice(PREFIXO_URL_LOCAL.length))
  if (!destino) return false
  await rm(/*turbopackIgnore: true*/ destino, { force: true })
  console.info('[ARMAZENAMENTO_LOCAL] removido', url)
  return true
}

export async function lerArquivoLocal(chave: string): Promise<{ conteudo: Buffer; tipo: string } | null> {
  const destino = caminhoLocalSeguro(chave)
  const tipo = tipoDoArquivoLocal(chave)
  if (!destino || !tipo) return null
  try {
    return { conteudo: await readFile(/*turbopackIgnore: true*/ destino), tipo }
  } catch {
    return null
  }
}
