import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { lerOriginalPrivado } from '@/features/documentos-fiscais/lib/armazenamento-fiscal'
import {
  ENTIDADES_AUDITORIA_FISCAL,
  metadadosAuditoriaFiscal,
} from '@/features/documentos-fiscais/lib/auditoria'
import { obterArquivoOriginalParaDownload } from '@/features/documentos-fiscais/queries/obter-arquivo-original'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Download autorizado do XML original.
 *
 * Mesmo desenho do download de anexo do Atendimento: o conteúdo mora em
 * armazenamento privado e sai daqui em stream, depois de sessão, permissão
 * `documentos_fiscais.baixar`, vínculo com o escritório e acesso ao cliente.
 * Nenhuma URL do storage chega ao navegador.
 */
const Id = z.string().uuid()

const naoEncontrado = () =>
  new NextResponse('Arquivo não encontrado.', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(
  request: Request,
  contexto: { params: Promise<{ documentoId: string; arquivoId: string }> },
) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return new NextResponse('Acesso não autorizado.', { status: 401 })

  const { documentoId, arquivoId } = await contexto.params
  if (!Id.safeParse(documentoId).success || !Id.safeParse(arquivoId).success) return naoEncontrado()

  const arquivo = await obterArquivoOriginalParaDownload({ usuarioId: sessao.id, documentoId, arquivoId })
  if (!arquivo) return naoEncontrado()

  const conteudo = await lerOriginalPrivado(arquivo.chave).catch(() => null)
  if (!conteudo) return naoEncontrado()

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.documentoFiscalBaixado,
    entidade: ENTIDADES_AUDITORIA_FISCAL.documento,
    registroAfetado: documentoId,
    autorId: sessao.id,
    empresaId: arquivo.empresaId,
    origem: 'admin',
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null,
    metadados: metadadosAuditoriaFiscal({ arquivoId, clienteId: arquivo.clienteId, tipoArquivo: 'xml' }),
  })

  const nome = arquivo.nomeOriginal.replace(/[^a-zA-Z0-9._-]/g, '_')
  return new NextResponse(conteudo.stream, {
    headers: {
      'Cache-Control': 'private, no-store',
      // Servido como anexo e em sandbox: o XML nunca é renderizado pelo navegador.
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
