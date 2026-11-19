import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { AvisoPrevia } from '@/features/conhecimento/components/publico/AvisoPrevia'
import { PaginaArtigo } from '@/features/conhecimento/components/publico/PaginaArtigo'
import { obterLeitorDaPrevia } from '@/features/conhecimento/lib/leitor-previa'
import { obterPreviaDoArtigo } from '@/features/conhecimento/queries/privado'

type Propriedades = { params: Promise<{ artigoId: string }> }

export const dynamic = 'force-dynamic'

/** Prévia nunca vai a buscador — nem por engano de link compartilhado. */
export const metadata: Metadata = {
  title: 'Pré-visualização do artigo | Vincis',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

/**
 * `/conhecimento/previa/<id>` — o texto em edição como o público o veria.
 * Só o autor (escopo no WHERE) ou a Gestão. Sem sessão → login.
 */
export default async function PreviaArtigoRoute({ params }: Propriedades) {
  const { artigoId } = await params
  const leitor = await obterLeitorDaPrevia(artigoId)
  if (leitor === 'sem_sessao') redirect('/?entrar=1')
  if (!leitor) notFound()
  const artigo = await obterPreviaDoArtigo(artigoId, leitor)
  if (!artigo) notFound()
  return <PaginaArtigo artigo={artigo} aviso={<AvisoPrevia artigoId={artigoId} gestor={leitor.gestor} />} />
}
