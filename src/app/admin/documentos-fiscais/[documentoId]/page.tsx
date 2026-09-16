import { notFound, redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { DetalheDocumentoFiscal } from '@/features/documentos-fiscais/components/painel/DetalheDocumentoFiscal'
import { obterDocumentoFiscal } from '@/features/documentos-fiscais/queries/obter-documento-fiscal'
import {
  lerFiltrosDocumentosFiscais,
  montarBuscaDocumentosFiscais,
} from '@/features/documentos-fiscais/schemas/filtros-documentos-fiscais'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Detalhe de uma NF-e importada.
 *
 * A autorização é da consulta: `obterDocumentoFiscal` resolve usuário →
 * escritório do documento → permissão → acesso ao cliente, e devolve `null`
 * tanto para documento inexistente quanto para documento de outro escritório.
 * Os dois viram 404 — a tela não revela que o documento existe em outro lugar.
 *
 * O parâmetro `voltar` traz os filtros da listagem. Ele é relido pelo mesmo
 * schema da Central Fiscal e remontado: só volta o que é filtro válido, nunca
 * um destino arbitrário vindo da URL.
 */
export const dynamic = 'force-dynamic'

export default async function DocumentoFiscalRoute({
  params,
  searchParams,
}: {
  params: Promise<{ documentoId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obterSessaoServidor()
  if (!usuario) redirect('/')

  const { documentoId } = await params
  const detalhe = await obterDocumentoFiscal(usuario.id, documentoId)
  if (!detalhe) notFound()

  const { voltar } = await searchParams
  const parametros = Object.fromEntries(
    new URLSearchParams(typeof voltar === 'string' ? voltar : '').entries(),
  )
  const filtros = lerFiltrosDocumentosFiscais(parametros)

  return (
    <AdminShell>
      <DetalheDocumentoFiscal detalhe={detalhe} voltarPara={montarBuscaDocumentosFiscais(filtros)} />
    </AdminShell>
  )
}
