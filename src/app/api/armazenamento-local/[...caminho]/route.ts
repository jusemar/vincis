import { NextResponse } from 'next/server'
import { driverArmazenamento } from '@/integracoes/armazenamento/config'
import { lerArquivoLocal } from '@/integracoes/armazenamento/local'

/**
 * Serve as imagens do driver local de armazenamento (só `next dev`).
 *
 * Fora do driver local responde 404: em produção esta rota não expõe nada.
 * A validação do caminho (sem `..`, só imagens) fica em `lerArquivoLocal`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ caminho: string[] }> }) {
  if (driverArmazenamento() !== 'local') return new NextResponse(null, { status: 404 })

  const { caminho } = await params
  const arquivo = await lerArquivoLocal(caminho.join('/'))
  if (!arquivo) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(arquivo.conteudo), {
    headers: {
      'Content-Type': arquivo.tipo,
      // Nome com UUID: cada upload gera uma URL nova, o conteúdo nunca muda.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
