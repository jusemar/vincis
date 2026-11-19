import { notFound } from 'next/navigation'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { ModeracaoArtigoPage } from '@/features/conhecimento/components/admin/ModeracaoArtigoPage'
import { obterPainelCardsHomeDoArtigo } from '@/features/conhecimento/queries/destaques-home'
import { identificadorSchema } from '@/features/conhecimento/schemas/artigo'
import {
  listarCategoriasParaFormulario,
  obterArtigoEmEdicao,
  obterPreviaDoArtigo,
} from '@/features/conhecimento/queries/privado'

export const dynamic = 'force-dynamic'

/** Análise de um artigo pela Gestão (profissional) ou edição (institucional). */
export default async function ModeracaoArtigoRoute({ params }: { params: Promise<{ artigoId: string }> }) {
  const gestor = await exigirGestorDaPlataforma()
  const { artigoId } = await params
  if (!identificadorSchema.safeParse(artigoId).success) notFound()
  const [artigo, previa, cardsHome] = await Promise.all([
    obterArtigoEmEdicao(artigoId, { tipo: 'gestao' }),
    obterPreviaDoArtigo(artigoId, { usuarioId: gestor.id, gestor: true }),
    obterPainelCardsHomeDoArtigo(artigoId),
  ])
  if (!artigo || !previa) notFound()
  const categorias =
    artigo.tipoAutoria === 'institucional' ? await listarCategoriasParaFormulario(artigo.dados.categoriaId) : []
  return <ModeracaoArtigoPage artigo={artigo} previa={previa} categorias={categorias} nomeGestor={gestor.nome} cardsHome={cardsHome} />
}
