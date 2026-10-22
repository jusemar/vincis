import path from 'node:path'

/**
 * Onde as imagens públicas (avatar e foto de destaque do perfil) são gravadas.
 *
 * - `local`: disco da própria máquina, servido por
 *   `/api/armazenamento-local/...`. Padrão do `next dev`: testar upload no
 *   localhost nunca alcança o Vercel Blob de homologação ou produção, mesmo
 *   com tokens reais presentes no `.env` / `.env.local`.
 * - `vercel-blob`: o storage remoto do ambiente. Padrão fora do `next dev`
 *   (build/`next start`, Vercel), exatamente como antes.
 *
 * `ARMAZENAMENTO_IMAGENS` força um dos dois. `local` em produção é recusado:
 * a Vercel não tem disco persistente, e servir arquivos locais lá seria um
 * defeito silencioso.
 */

export type DriverArmazenamento = 'local' | 'vercel-blob'

/** Prefixo público das URLs do driver local — também o da rota que as serve. */
export const PREFIXO_URL_LOCAL = '/api/armazenamento-local/'

export function driverArmazenamento(): DriverArmazenamento {
  const forcado = process.env.ARMAZENAMENTO_IMAGENS
  const producao = process.env.NODE_ENV === 'production'

  if (forcado === 'local') {
    if (producao) throw new Error('ARMAZENAMENTO_IMAGENS=local não é permitido em produção.')
    return 'local'
  }
  if (forcado === 'vercel-blob') return 'vercel-blob'
  if (forcado) throw new Error(`ARMAZENAMENTO_IMAGENS inválido: "${forcado}". Use "local" ou "vercel-blob".`)

  return process.env.NODE_ENV === 'development' ? 'local' : 'vercel-blob'
}

/**
 * Pasta do driver local (fora do controle de versão; ver `.gitignore`).
 *
 * `turbopackIgnore`: caminho só de desenvolvimento — sem o comentário, o
 * rastreamento de arquivos do build trataria o projeto inteiro como
 * dependência da rota.
 */
export function pastaArmazenamentoLocal(): string {
  return (
    process.env.ARMAZENAMENTO_LOCAL_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), '.armazenamento-local')
  )
}
