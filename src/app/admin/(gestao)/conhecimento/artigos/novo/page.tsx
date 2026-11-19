import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { FormularioArtigo } from '@/features/conhecimento/components/editor/FormularioArtigo'
import { ROTA_GESTAO_CONHECIMENTO } from '@/features/conhecimento/constants/rotas'
import { obterPainelCardsHomeDoArtigo } from '@/features/conhecimento/queries/destaques-home'
import { listarCategoriasParaFormulario } from '@/features/conhecimento/queries/privado'

export const dynamic = 'force-dynamic'

/** Novo artigo institucional (autoria Vincis). */
export default async function NovoArtigoInstitucionalRoute() {
  const gestor = await exigirGestorDaPlataforma()
  const [categorias, cardsHome] = await Promise.all([listarCategoriasParaFormulario(null), obterPainelCardsHomeDoArtigo(null)])
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">Novo artigo institucional</h1>
      <FormularioArtigo
        modo="institucional"
        artigo={null}
        categorias={categorias}
        nomeGestor={gestor.nome}
        rotaVoltar={ROTA_GESTAO_CONHECIMENTO}
        prefixoEdicao={`${ROTA_GESTAO_CONHECIMENTO}/artigos`}
        cardsHome={cardsHome}
      />
    </div>
  )
}
