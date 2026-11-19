import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { caminhoArtigo, ROTA_CONHECIMENTO } from '../../constants/rotas'
import { formatarData } from '../../lib/apresentacao'
import type { CardArtigo } from '../../types/artigo'

/**
 * Seção "Artigos deste profissional" do perfil público.
 *
 * Recebe a lista já filtrada no servidor (`listarArtigosPublicadosDoAutor`:
 * só publicados, só deste autor) — a mesma fonte da Central. Lista vazia vira
 * um estado vazio honesto, sem artigo de exemplo.
 */
export function ArtigosDoProfissional({ artigos, nomeAutor }: { artigos: CardArtigo[]; nomeAutor: string }) {
  return (
    <section
      aria-labelledby="titulo-artigos-profissional"
      className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-primary">Central de Conhecimento</span>
      <h2 id="titulo-artigos-profissional" className="mb-6 text-3xl font-bold tracking-tight text-foreground">
        Artigos deste profissional
      </h2>

      {artigos.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {nomeAutor ? `${nomeAutor} ainda não publicou artigos na Vincis.` : 'Este profissional ainda não publicou artigos.'}{' '}
          <Link href={ROTA_CONHECIMENTO} className="font-semibold text-primary underline-offset-4 hover:underline">
            Conheça a Central de Conhecimento
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {artigos.map((artigo) => (
            <li key={artigo.id}>
              <article className={`group relative flex flex-col overflow-hidden${artigo.capaUrl ? ' h-full' : ''} rounded-xl border border-border bg-muted/30 transition-colors focus-within:ring-2 focus-within:ring-primary hover:border-primary/40`}>
                {artigo.capaUrl ? (
                  <div className="aspect-[16/9] shrink-0 overflow-hidden bg-muted">
                    <img
                      src={artigo.capaUrl}
                      alt={artigo.capaAlt ?? ''}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className={`flex flex-col gap-2 p-4${artigo.capaUrl ? ' flex-1' : ''}`}>
                  <p className="text-xs font-semibold text-primary">
                    {[artigo.categoria?.nome, formatarData(artigo.publicadoEm)].filter(Boolean).join(' · ')}
                  </p>
                  <h3 className="font-bold leading-snug text-foreground">
                    <Link
                      href={caminhoArtigo(artigo.slug)}
                      className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                    >
                      {artigo.titulo}
                    </Link>
                  </h3>
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{artigo.resumo}</p>
                  <span className={`inline-flex items-center gap-1 pt-1 text-xs font-bold text-primary${artigo.capaUrl ? ' mt-auto' : ''}`}>
                    Ler artigo <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
