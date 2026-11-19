import { redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import { FormularioArtigo } from '@/features/conhecimento/components/editor/FormularioArtigo'
import { ROTA_MEUS_ARTIGOS } from '@/features/conhecimento/constants/rotas'
import { obterAutorDaSessao } from '@/features/conhecimento/lib/autorizacao'
import { obterPainelCardsHomeDoArtigo } from '@/features/conhecimento/queries/destaques-home'
import { listarCategoriasParaFormulario } from '@/features/conhecimento/queries/privado'

export const dynamic = 'force-dynamic'

/** Novo artigo do profissional. Sem perfil na vitrine → volta à lista (com a orientação). */
export default async function NovoArtigoRoute() {
  const autor = await obterAutorDaSessao()
  if (!autor) redirect(ROTA_ADMIN)
  if (!autor.elegivelParaPublicar) redirect(ROTA_MEUS_ARTIGOS)
  const [categorias, cardsHome] = await Promise.all([listarCategoriasParaFormulario(null), obterPainelCardsHomeDoArtigo(null)])
  return (
    <AdminShell>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">Novo artigo</h1>
      <FormularioArtigo
        modo="profissional"
        artigo={null}
        categorias={categorias}
        elegivel
        rotaVoltar={ROTA_MEUS_ARTIGOS}
        prefixoEdicao={ROTA_MEUS_ARTIGOS}
        cardsHome={cardsHome}
      />
    </AdminShell>
  )
}
