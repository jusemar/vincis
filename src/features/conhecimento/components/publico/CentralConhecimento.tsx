import Link from 'next/link'
import { ChevronLeft, ChevronRight, PenLine, Search, Sparkles } from 'lucide-react'
import { ROTA_CONHECIMENTO, ROTA_MEUS_ARTIGOS } from '../../constants/rotas'
import type { CardArtigo as Artigo, CategoriaPublica } from '../../types/artigo'
import { CardArtigo } from './CardArtigo'
import { cn } from '@/lib/utils'

/**
 * `/conhecimento` — página inicial da Central (componente de servidor).
 *
 * Busca e filtros são um formulário GET e links comuns: funcionam sem
 * JavaScript, cada combinação tem URL própria e o conteúdo chega renderizado
 * no HTML (bom para leitores de tela e buscadores).
 */
type Propriedades = {
  categorias: CategoriaPublica[]
  categoriaAtual: CategoriaPublica | null
  busca?: string
  destaques: Artigo[]
  lista: { itens: Artigo[]; total: number; pagina: number; totalPaginas: number }
}

function urlDaCentral(parametros: { categoria?: string; busca?: string; pagina?: number }) {
  const query = new URLSearchParams()
  if (parametros.categoria) query.set('categoria', parametros.categoria)
  if (parametros.busca) query.set('busca', parametros.busca)
  if (parametros.pagina && parametros.pagina > 1) query.set('pagina', String(parametros.pagina))
  return `${ROTA_CONHECIMENTO}${query.size ? `?${query}` : ''}`
}

export function CentralConhecimento({ categorias, categoriaAtual, busca, destaques, lista }: Propriedades) {
  const filtrando = Boolean(categoriaAtual || busca)
  const tituloLista = busca
    ? `Resultados para “${busca}”`
    : categoriaAtual
      ? categoriaAtual.nome
      : 'Artigos recentes'

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-gradient-to-b from-primary/10 via-background to-background" />

      {/* Cabeçalho + busca */}
      <section className="mx-auto max-w-7xl px-4 pb-8 pt-28 sm:px-6 lg:px-8 lg:pt-32">
        <nav aria-label="Trilha de navegação" className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/" className="alvo-toque-h inline-flex items-center hover:text-primary">
            Início
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="font-semibold text-foreground">Conhecimento</span>
        </nav>
        <div className="max-w-3xl">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Sparkles className="size-3.5" aria-hidden /> Central de Conhecimento
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Conteúdo confiável para decidir melhor
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            Artigos sobre contabilidade, tributos e direito empresarial, escritos por profissionais da Vincis e
            revisados pela nossa equipe antes de serem publicados.
          </p>
        </div>

        <form action={ROTA_CONHECIMENTO} method="get" role="search" className="mt-8 flex max-w-2xl gap-2">
          {categoriaAtual ? <input type="hidden" name="categoria" value={categoriaAtual.slug} /> : null}
          <label htmlFor="busca-conhecimento" className="sr-only">
            Pesquisar por assunto
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="busca-conhecimento"
              name="busca"
              type="search"
              defaultValue={busca}
              maxLength={120}
              placeholder="Pesquise por assunto: MEI, IRPF, Simples…"
              className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-base text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="h-12 shrink-0 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Buscar
          </button>
        </form>

        {/* Categorias: rolagem horizontal no celular, quebra de linha no desktop. */}
        <nav aria-label="Categorias" className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            <li>
              <Link
                href={urlDaCentral({ busca })}
                aria-current={!categoriaAtual ? 'page' : undefined}
                className={cn(
                  'alvo-toque-h inline-flex items-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                  !categoriaAtual
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/50',
                )}
              >
                Todas
              </Link>
            </li>
            {categorias.map((categoria) => {
              const ativa = categoriaAtual?.id === categoria.id
              return (
                <li key={categoria.id}>
                  <Link
                    href={urlDaCentral({ categoria: categoria.slug, busca })}
                    aria-current={ativa ? 'page' : undefined}
                    className={cn(
                      'alvo-toque-h inline-flex items-center whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                      ativa
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/50',
                    )}
                  >
                    {categoria.nome}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </section>

      {/* Destaques — só na página inicial sem filtro, e só se a Gestão marcou algum. */}
      {!filtrando && lista.pagina === 1 && destaques.length > 0 ? (
        <section aria-labelledby="titulo-destaques" className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <h2 id="titulo-destaques" className="mb-5 text-2xl font-bold tracking-tight text-foreground">
            Em destaque
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {destaques.map((artigo, indice) => (
              <div key={artigo.id} className={cn(indice === 0 && 'lg:col-span-2')}>
                <CardArtigo artigo={artigo} destaque={indice === 0} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="titulo-lista" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <h2 id="titulo-lista" className="text-2xl font-bold tracking-tight text-foreground">
            {tituloLista}
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {lista.total === 1 ? '1 artigo' : `${lista.total} artigos`}
          </p>
        </div>
        {categoriaAtual?.descricao ? (
          <p className="-mt-2 mb-6 max-w-3xl text-sm text-muted-foreground">{categoriaAtual.descricao}</p>
        ) : null}

        {lista.itens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="font-semibold text-foreground">
              {filtrando ? 'Nenhum artigo encontrado com esses filtros.' : 'Os primeiros artigos estão a caminho.'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {filtrando ? (
                <Link href={ROTA_CONHECIMENTO} className="font-semibold text-primary hover:underline">
                  Ver todos os artigos
                </Link>
              ) : (
                'Assim que forem aprovados pela equipe Vincis, eles aparecem aqui.'
              )}
            </p>
          </div>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lista.itens.map((artigo) => (
              <li key={artigo.id}>
                <CardArtigo artigo={artigo} />
              </li>
            ))}
          </ul>
        )}

        {lista.totalPaginas > 1 ? (
          <nav aria-label="Paginação" className="mt-10 flex items-center justify-center gap-2">
            {lista.pagina > 1 ? (
              <Link
                href={urlDaCentral({ categoria: categoriaAtual?.slug, busca, pagina: lista.pagina - 1 })}
                rel="prev"
                className="alvo-toque-h inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary/50"
              >
                <ChevronLeft className="size-4" aria-hidden /> Anterior
              </Link>
            ) : null}
            <span className="px-3 text-sm text-muted-foreground">
              Página {lista.pagina} de {lista.totalPaginas}
            </span>
            {lista.pagina < lista.totalPaginas ? (
              <Link
                href={urlDaCentral({ categoria: categoriaAtual?.slug, busca, pagina: lista.pagina + 1 })}
                rel="next"
                className="alvo-toque-h inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary/50"
              >
                Próxima <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {/* Convite aos profissionais — rotas reais: painel (logado) ou cadastro. */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PenLine className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground">É profissional na Vincis? Publique seus artigos.</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Compartilhe seu conhecimento. Cada artigo aprovado aparece aqui e no seu perfil público.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={ROTA_MEUS_ARTIGOS}
              className="alvo-toque-h inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Escrever um artigo
            </Link>
            <Link
              href="/cadastro-profissional"
              className="alvo-toque-h inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-bold text-foreground hover:border-primary/50"
            >
              Cadastrar-me
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
