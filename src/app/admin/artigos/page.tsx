import { redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import { MeusArtigosPage } from '@/features/conhecimento/components/operacional/MeusArtigosPage'
import { obterAutorDaSessao } from '@/features/conhecimento/lib/autorizacao'
import { listarArtigosDoAutor } from '@/features/conhecimento/queries/privado'
import { caminhoDoPerfilPublico } from '@/features/perfis/constants/rotas-perfil'
import { garantirSlugDoPrestador } from '@/features/perfis/lib/slug-perfil'

/**
 * Meus artigos — painel do profissional.
 *
 * Fora do grupo `(gestao)`, como Meus preços: é trabalho do prestador, não da
 * plataforma. A porta (`obterAutorDaSessao`) relê sessão e cadastro; quem não
 * é prestador com perfil público volta para o painel.
 */
export const dynamic = 'force-dynamic'

export default async function MeusArtigosRoute() {
  const autor = await obterAutorDaSessao()
  if (!autor) redirect(ROTA_ADMIN)
  const [artigos, slug] = await Promise.all([listarArtigosDoAutor(autor.usuarioId), garantirSlugDoPrestador(autor.usuarioId)])
  return (
    <AdminShell>
      <MeusArtigosPage
        artigos={artigos}
        elegivel={autor.elegivelParaPublicar}
        perfilUrl={caminhoDoPerfilPublico(autor.usuarioId, slug)}
      />
    </AdminShell>
  )
}
