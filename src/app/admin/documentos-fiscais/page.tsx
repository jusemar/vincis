import { redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import { CentralFiscalPage } from '@/features/documentos-fiscais/components/painel/CentralFiscalPage'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '@/features/documentos-fiscais/constants/permissoes'
import { resolverAcessoDocumentosFiscais } from '@/features/documentos-fiscais/lib/acesso-documentos-fiscais'
import {
  listarContribuintesComDocumentos,
  listarDocumentosFiscais,
} from '@/features/documentos-fiscais/queries/listar-documentos-fiscais'
import { lerFiltrosDocumentosFiscais } from '@/features/documentos-fiscais/schemas/filtros-documentos-fiscais'
import { lerEmpresaAtivaCookie } from '@/features/empresas/lib/contexto-empresa-cookie'
import { resolverContextoTenant } from '@/features/empresas/lib/resolver-contexto-tenant'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Central Fiscal — documentos fiscais do escritório.
 *
 * Rota própria, e não uma seção de `?pagina=`: a tela consulta, filtra e pagina
 * no banco a cada visita, e virar seção faria `/admin` carregar documentos
 * fiscais para quem só foi ver a Agenda.
 *
 * ## A porta é aqui, não no menu
 *
 * Sessão, escritório ativo (pelo vínculo real, não pelo cookie) e
 * `documentos_fiscais.visualizar` são conferidos antes de qualquer consulta.
 * Esconder o item do menu não autoriza nada — quem digitar a URL sem permissão é
 * devolvido ao painel. As permissões de enviar, revisar e baixar são resolvidas
 * aqui também, e viajam para a tela só para decidir que botão aparece: cada ação
 * confere de novo no servidor.
 */
export const dynamic = 'force-dynamic'

export default async function DocumentosFiscaisRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obterSessaoServidor()
  if (!usuario) redirect('/')

  const contexto = await resolverContextoTenant(usuario.id, await lerEmpresaAtivaCookie())
  if (contexto.estado !== 'ativo' || !contexto.contexto) redirect(ROTA_ADMIN)
  const empresaId = contexto.contexto.empresaId

  const [visualizar, enviar, revisar, baixar] = await Promise.all([
    resolverAcessoDocumentosFiscais(usuario.id, PERMISSOES_DOCUMENTOS_FISCAIS.visualizar, empresaId),
    resolverAcessoDocumentosFiscais(usuario.id, PERMISSOES_DOCUMENTOS_FISCAIS.enviar, empresaId),
    resolverAcessoDocumentosFiscais(usuario.id, PERMISSOES_DOCUMENTOS_FISCAIS.revisar, empresaId),
    resolverAcessoDocumentosFiscais(usuario.id, PERMISSOES_DOCUMENTOS_FISCAIS.baixar, empresaId),
  ])
  if (!visualizar) redirect(ROTA_ADMIN)

  const filtros = lerFiltrosDocumentosFiscais(await searchParams)
  const [lista, contribuintes] = await Promise.all([
    listarDocumentosFiscais(visualizar, {
      pagina: filtros.pagina,
      clienteId: filtros.cliente,
      sentido: filtros.sentido,
      processamento: filtros.processamento,
      revisao: filtros.revisao,
      de: filtros.de,
      ate: filtros.ate,
      busca: filtros.busca,
      atencao: filtros.atencao,
      ordem: filtros.ordem,
    }),
    listarContribuintesComDocumentos(visualizar),
  ])

  return (
    <AdminShell>
      <CentralFiscalPage
        documentos={lista.documentos}
        resumo={lista.resumo}
        pagina={lista.pagina}
        totalPaginas={lista.totalPaginas}
        filtros={filtros}
        contribuintes={contribuintes}
        permissoes={{
          enviar: Boolean(enviar),
          revisar: Boolean(revisar),
          baixar: Boolean(baixar),
        }}
      />
    </AdminShell>
  )
}
