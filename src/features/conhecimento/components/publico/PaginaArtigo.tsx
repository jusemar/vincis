import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, BookOpen, CalendarDays, ChevronRight, Clock, ExternalLink, Info, LifeBuoy, UserRound } from 'lucide-react'
import { ROTA_CONHECIMENTO, caminhoCategoria } from '../../constants/rotas'
import {
  chamadaDeConversao,
  descricaoDoAutor,
  formatarData,
  identificacaoDoAutor,
  mesmoDia,
  nomeDoAutor,
} from '../../lib/apresentacao'
import type { ArtigoCompleto, CardArtigo as Artigo } from '../../types/artigo'
import { AvatarAutor } from './AvatarAutor'
import { CardArtigo } from './CardArtigo'
import { ConteudoArtigo } from './ConteudoArtigo'

/**
 * Página de um artigo (servidor). Usada pela rota pública e pela prévia privada
 * — a prévia passa `aviso` e não recebe relacionados.
 *
 * A trilha desenhada aqui é a mesma do BreadcrumbList do JSON-LD.
 */
export function PaginaArtigo({
  artigo,
  relacionados = [],
  aviso,
}: {
  artigo: ArtigoCompleto
  relacionados?: Artigo[]
  aviso?: ReactNode
}) {
  const chamada = chamadaDeConversao(artigo.categoriaCompleta)
  const autor = artigo.autor
  const atualizado = !mesmoDia(artigo.publicadoEm, artigo.atualizadoEm)

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-primary/10 to-background" />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8 lg:pt-32">
        {aviso}
        <nav aria-label="Trilha de navegação" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="alvo-toque-h inline-flex items-center hover:text-primary">
            Início
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href={ROTA_CONHECIMENTO} className="alvo-toque-h inline-flex items-center hover:text-primary">
            Conhecimento
          </Link>
          {artigo.categoria ? (
            <>
              <ChevronRight className="size-3" aria-hidden />
              <Link href={caminhoCategoria(artigo.categoria.slug)} className="alvo-toque-h inline-flex items-center hover:text-primary">
                {artigo.categoria.nome}
              </Link>
            </>
          ) : null}
        </nav>

        <div className="grid gap-10 lg:grid-cols-12">
          <article className="min-w-0 lg:col-span-8">
            <header>
              {artigo.categoria ? (
                <Link
                  href={caminhoCategoria(artigo.categoria.slug)}
                  className="mb-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary/15"
                >
                  {artigo.categoria.nome}
                </Link>
              ) : null}
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {artigo.titulo}
              </h1>
              {artigo.resumo ? <p className="mt-4 text-lg leading-8 text-muted-foreground">{artigo.resumo}</p> : null}

              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-border py-4 text-sm">
                <div className="flex items-center gap-3">
                  <AvatarAutor autor={autor} />
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {autor.tipo === 'profissional' ? (
                        <Link href={autor.perfilUrl} rel="author" className="hover:text-primary hover:underline">
                          {autor.nome}
                        </Link>
                      ) : (
                        nomeDoAutor(autor)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{descricaoDoAutor(autor)}</p>
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="size-4" aria-hidden />
                  <time dateTime={artigo.publicadoEm.toISOString()}>{formatarData(artigo.publicadoEm)}</time>
                  {atualizado ? (
                    <span>
                      · atualizado em <time dateTime={artigo.atualizadoEm.toISOString()}>{formatarData(artigo.atualizadoEm)}</time>
                    </span>
                  ) : null}
                </p>
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-4" aria-hidden /> {artigo.minutosLeitura} min de leitura
                </p>
              </div>
            </header>

            {artigo.capaUrl ? (
              <figure className="my-8">
                <img
                  src={artigo.capaUrl}
                  alt={artigo.capaAlt ?? ''}
                  decoding="async"
                  className="aspect-[16/9] w-full rounded-2xl border border-border bg-muted object-cover"
                />
              </figure>
            ) : (
              <div className="my-8" />
            )}

            <ConteudoArtigo conteudo={artigo.conteudo} />

            {artigo.palavrasChave.length > 0 ? (
              <nav aria-label="Assuntos do artigo" className="mt-10">
                <ul className="flex flex-wrap gap-2">
                  {artigo.palavrasChave.map((palavra) => (
                    <li key={palavra}>
                      <Link
                        href={`${ROTA_CONHECIMENTO}?busca=${encodeURIComponent(palavra)}`}
                        className="alvo-toque-h inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
                      >
                        #{palavra}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {artigo.fontes.length > 0 ? (
              <section aria-labelledby="titulo-fontes" className="mt-12 rounded-2xl border border-border bg-card p-6">
                <h2 id="titulo-fontes" className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
                  <BookOpen className="size-5 text-primary" aria-hidden /> Fontes e referências
                </h2>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  {artigo.fontes.map((fonte, indice) => (
                    <li key={`${indice}-${fonte.titulo}`}>
                      {fonte.url ? (
                        <a
                          href={fonte.url}
                          target="_blank"
                          rel="nofollow ugc noopener noreferrer"
                          className="inline-flex items-center gap-1 text-foreground underline decoration-border underline-offset-4 hover:text-primary"
                        >
                          {fonte.titulo} <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-foreground">{fonte.titulo}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <p className="mt-8 flex items-start gap-2 rounded-xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Conteúdo informativo, revisado pela equipe Vincis antes da publicação. Não substitui a análise de um
              profissional sobre o seu caso concreto — regras fiscais e jurídicas mudam com frequência.
            </p>
          </article>

          <aside className="lg:col-span-4">
            <div className="space-y-6 lg:sticky lg:top-28">
              {/* Autor → perfil profissional (navegação nos dois sentidos). */}
              <section aria-labelledby="titulo-autor" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 id="titulo-autor" className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">
                  Sobre o autor
                </h2>
                <div className="flex items-center gap-4">
                  <AvatarAutor autor={autor} tamanho="lg" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground">{nomeDoAutor(autor)}</p>
                    <p className="text-sm text-muted-foreground">{descricaoDoAutor(autor)}</p>
                    {identificacaoDoAutor(autor) ? (
                      <p className="mt-1 text-xs text-muted-foreground">{identificacaoDoAutor(autor)}</p>
                    ) : null}
                  </div>
                </div>
                {autor.tipo === 'profissional' ? (
                  <Link
                    href={autor.perfilUrl}
                    className="alvo-toque-h mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <UserRound className="size-4" aria-hidden /> Ver perfil profissional
                  </Link>
                ) : autor.tipo === 'equipe' ? (
                  // Equipe Vincis: contato com o Suporte (hoje a Central de Ajuda;
                  // um provedor de conversa pode assumir — ver `canal-suporte`).
                  <Link
                    href={autor.contato.href}
                    {...(autor.contato.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="alvo-toque-h mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <LifeBuoy className="size-4" aria-hidden /> {autor.contato.rotulo}
                  </Link>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Artigo produzido pela equipe da Vincis.</p>
                )}
              </section>

              {/* Conversão: rota e filtro reais da busca. */}
              <section className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg">
                <p className="text-lg font-bold leading-snug">{chamada.texto}</p>
                <Link
                  href={chamada.rota}
                  className="alvo-toque-h mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-background px-4 py-2.5 text-sm font-bold text-foreground transition-transform hover:-translate-y-0.5"
                >
                  Encontrar um profissional <ArrowRight className="size-4" aria-hidden />
                </Link>
              </section>
            </div>
          </aside>
        </div>

        {relacionados.length > 0 ? (
          <section aria-labelledby="titulo-relacionados" className="mt-16">
            <h2 id="titulo-relacionados" className="mb-6 text-2xl font-bold tracking-tight text-foreground">
              Continue lendo
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relacionados.map((relacionado) => (
                <li key={relacionado.id}>
                  <CardArtigo artigo={relacionado} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
