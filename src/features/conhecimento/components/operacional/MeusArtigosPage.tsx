import Link from 'next/link'
import { FileText, PenLine } from 'lucide-react'
import { caminhoArtigo, caminhoEdicaoArtigo, ROTA_MEUS_ARTIGOS } from '../../constants/rotas'
import { formatarData } from '../../lib/apresentacao'
import type { ResumoArtigoGestao } from '../../types/artigo'
import { SituacaoEditorialBadge } from '../SituacaoEditorialBadge'

/** Painel "Meus artigos" do profissional (servidor). Só os artigos dele. */
export function MeusArtigosPage({
  artigos,
  elegivel,
  perfilUrl,
}: {
  artigos: ResumoArtigoGestao[]
  elegivel: boolean
  perfilUrl: string | null
}) {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Meus artigos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Escreva artigos para a Central de Conhecimento. Depois da aprovação da equipe Vincis, eles aparecem em{' '}
            <Link href="/conhecimento" className="font-semibold text-primary hover:underline">/conhecimento</Link>
            {perfilUrl ? (
              <>
                {' '}e no seu{' '}
                <Link href={perfilUrl} className="font-semibold text-primary hover:underline">perfil público</Link>
              </>
            ) : null}
            .
          </p>
        </div>
        {elegivel ? (
          <Link
            href={`${ROTA_MEUS_ARTIGOS}/novo`}
            className="alvo-toque-h inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <PenLine className="size-4" aria-hidden /> Novo artigo
          </Link>
        ) : null}
      </header>

      {!elegivel ? (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Para publicar artigos, seu perfil público precisa estar completo e visível na busca — com foto (ou logotipo do
          escritório).{' '}
          <Link href="/admin?pagina=profile" className="font-semibold text-primary underline">
            Completar meu perfil
          </Link>
        </div>
      ) : null}

      {artigos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-semibold text-foreground">Você ainda não escreveu artigos.</p>
          <p className="mt-1 text-sm text-muted-foreground">Compartilhe o que você sabe — cada artigo aprovado leva leitores ao seu perfil.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {artigos.map((artigo) => (
            <li key={artigo.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={caminhoEdicaoArtigo(artigo.id)} className="font-semibold text-foreground hover:text-primary">
                  {artigo.titulo}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[artigo.categoria, artigo.publicadoEm ? `publicado em ${formatarData(artigo.publicadoEm)}` : null, `atualizado em ${formatarData(artigo.atualizadoEm)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SituacaoEditorialBadge situacao={artigo.situacao} />
                {artigo.revisaoEmAndamento ? (
                  <span className="text-xs text-muted-foreground">
                    revisão {artigo.versaoAbertaStatus === 'aguardando_aprovacao' ? 'em análise' : 'em edição'}
                  </span>
                ) : null}
                {artigo.statusPublicacao === 'publicado' ? (
                  <Link href={caminhoArtigo(artigo.slug)} target="_blank" className="text-xs font-semibold text-primary hover:underline">
                    Ver no site
                  </Link>
                ) : null}
                <Link
                  href={caminhoEdicaoArtigo(artigo.id)}
                  className="alvo-toque-h inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50"
                >
                  Abrir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
