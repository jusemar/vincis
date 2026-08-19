import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterArquivoDoAtendimento } from '@/features/atendimentos/queries/obter-arquivo-do-atendimento'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Download autorizado de um anexo do Atendimento.
 *
 * O conteúdo mora em armazenamento privado e nunca ganha URL pública: quem
 * quiser o arquivo passa por aqui, e aqui a sessão e o vínculo com o
 * Atendimento são conferidos antes de qualquer byte sair.
 */
export async function GET(
  _: Request,
  contexto: {
    params: Promise<{ atendimentoId: string; arquivoId: string }>
  },
) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return new NextResponse('Acesso não autorizado.', { status: 401 })

  const { atendimentoId, arquivoId } = await contexto.params
  const arquivo = await obterArquivoDoAtendimento({
    atendimentoId,
    arquivoId,
    usuarioId: sessao.id,
  })
  if (!arquivo) return new NextResponse('Arquivo não encontrado.', { status: 404 })

  const resultado = await get(arquivo.chave, { access: 'private', useCache: false })
  if (!resultado || resultado.statusCode !== 200) {
    return new NextResponse('Arquivo não encontrado.', { status: 404 })
  }

  const nome = arquivo.nome.replace(/[^a-zA-Z0-9._-]/g, '_')
  return new NextResponse(resultado.stream, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': resultado.blob.contentType,
      'Content-Disposition': `attachment; filename="${nome}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
