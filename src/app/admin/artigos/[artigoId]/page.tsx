import { notFound, redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import { FormularioArtigo } from '@/features/conhecimento/components/editor/FormularioArtigo'
import { ROTA_MEUS_ARTIGOS } from '@/features/conhecimento/constants/rotas'
import { obterAutorDaSessao } from '@/features/conhecimento/lib/autorizacao'
import { identificadorSchema } from '@/features/conhecimento/schemas/artigo'
import { obterPainelCardsHomeDoArtigo } from '@/features/conhecimento/queries/destaques-home'
import { listarCategoriasParaFormulario, obterArtigoEmEdicao } from '@/features/conhecimento/queries/privado'

export const dynamic = 'force-dynamic'

/**
 * Edição do artigo pelo autor. O escopo `autor_id = sessão` vai no WHERE:
 * artigo de outro profissional responde 404, igual a um id inexistente.
 */
export default async function EditarArtigoRoute({ params }: { params: Promise<{ artigoId: string }> }) {
  const autor = await obterAutorDaSessao()
  if (!autor) redirect(ROTA_ADMIN)
  const { artigoId } = await params
  if (!identificadorSchema.safeParse(artigoId).success) notFound()
  const artigo = await obterArtigoEmEdicao(artigoId, { tipo: 'profissional', autorId: autor.usuarioId })
  if (!artigo) notFound()
  // Painel dos cards da Home: `null` para quem não é Gestor.
  const [categorias, cardsHome] = await Promise.all([
    listarCategoriasParaFormulario(artigo.dados.categoriaId),
    obterPainelCardsHomeDoArtigo(artigo.id),
  ])
  return (
    <AdminShell>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">Editar artigo</h1>
      <FormularioArtigo
        modo="profissional"
        artigo={artigo}
        categorias={categorias}
        elegivel={autor.elegivelParaPublicar}
        rotaVoltar={ROTA_MEUS_ARTIGOS}
        prefixoEdicao={ROTA_MEUS_ARTIGOS}
        cardsHome={cardsHome}
      />
    </AdminShell>
  )
}
