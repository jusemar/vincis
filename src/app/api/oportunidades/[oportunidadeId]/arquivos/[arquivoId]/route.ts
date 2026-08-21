import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterArquivoDaOportunidade } from '@/features/oportunidades/queries/obter-arquivo-da-oportunidade'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Download autorizado de um anexo da solicitação de orçamento.
 *
 * Mesma forma da rota de anexos do Atendimento: o conteúdo mora em
 * armazenamento privado e nunca ganha URL pública. Quem quiser o arquivo passa
 * por aqui, e aqui a sessão e o vínculo com a oportunidade são conferidos antes
 * de qualquer byte sair.
 */
export async function GET(
  _: Request,
  contexto: {
    params: Promise<{ oportunidadeId: string; arquivoId: string }>
  },
) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return new NextResponse('Acesso não autorizado.', { status: 401 })

  const { oportunidadeId, arquivoId } = await contexto.params
  const arquivo = await obterArquivoDaOportunidade({
    oportunidadeId,
    arquivoId,
    usuarioId: sessao.id,
  })
  if (!arquivo) {
    return new NextResponse('Arquivo não encontrado.', { status: 404 })
  }

  const resultado = await get(arquivo.chave, {
    access: 'private',
    useCache: false,
  })
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
