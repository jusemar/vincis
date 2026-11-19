import Link from 'next/link'
import { PenLine, Star } from 'lucide-react'
import { ROTA_GESTAO_CONHECIMENTO, caminhoModeracaoArtigo } from '../../constants/rotas'
import { formatarData } from '../../lib/apresentacao'
import type { FiltroGestao } from '../../queries/privado'
import type { ResumoArtigoGestao } from '../../types/artigo'
import { SituacaoEditorialBadge } from '../SituacaoEditorialBadge'
import { GestaoCategorias, type CategoriaGestao } from './GestaoCategorias'
import { GestaoDestaquesHome } from './GestaoDestaquesHome'
import type { CardParaDestaque } from '../../queries/destaques-home'
import { cn } from '@/lib/utils'

export type AbaConhecimento = FiltroGestao | 'categorias' | 'home'

const ABAS: { id: AbaConhecimento; rotulo: string }[] = [
  { id: 'fila', rotulo: 'Fila de moderação' },
  { id: 'publicados', rotulo: 'Publicados' },
  { id: 'todos', rotulo: 'Todos' },
  { id: 'arquivados', rotulo: 'Arquivados' },
  { id: 'categorias', rotulo: 'Categorias' },
  { id: 'home', rotulo: 'Cards da Home' },
]

/** Central de Conhecimento na Gestão (servidor; ações em componentes de cliente). */
export function GestaoConhecimentoPage({
  aba,
  busca,
  fila,
  lista,
  categorias,
  destaquesHome,
}: {
  aba: AbaConhecimento
  busca: string
  fila: number
  lista: { itens: ResumoArtigoGestao[]; total: number; pagina: number; totalPaginas: number } | null
  categorias: CategoriaGestao[] | null
  destaquesHome: { cards: CardParaDestaque[]; artigos: { id: string; titulo: string; categoria: string | null }[] } | null
}) {
  const url = (parametros: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams()
    for (const [chave, valor] of Object.entries(parametros)) if (valor) query.set(chave, String(valor))
    return `${ROTA_GESTAO_CONHECIMENTO}${query.size ? `?${query}` : ''}`
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Central de Conhecimento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Moderação dos artigos dos profissionais, artigos institucionais e categorias.{' '}
            <Link href="/conhecimento" target="_blank" className="font-semibold text-primary hover:underline">
              Ver a Central
            </Link>
          </p>
        </div>
        <Link
          href={`${ROTA_GESTAO_CONHECIMENTO}/artigos/novo`}
          className="alvo-toque-h inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          <PenLine className="size-4" aria-hidden /> Novo artigo institucional
        </Link>
      </header>

      <nav aria-label="Seções" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {ABAS.map((item) => (
            <li key={item.id}>
              <Link
                href={url({ aba: item.id === 'fila' ? undefined : item.id })}
                aria-current={aba === item.id ? 'page' : undefined}
                className={cn(
                  'alvo-toque-h inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold',
                  aba === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.rotulo}
                {item.id === 'fila' && fila > 0 ? (
                  <span className="rounded-full bg-amber-500 px-1.5 text-xs text-white">{fila}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {aba === 'categorias' && categorias ? <GestaoCategorias categorias={categorias} /> : null}
      {aba === 'home' && destaquesHome ? <GestaoDestaquesHome cards={destaquesHome.cards} artigos={destaquesHome.artigos} /> : null}

      {lista ? (
        <section className="space-y-4">
          <form method="get" action={ROTA_GESTAO_CONHECIMENTO} className="flex max-w-md gap-2">
            {aba !== 'fila' ? <input type="hidden" name="aba" value={aba} /> : null}
            <label htmlFor="busca-gestao-conhecimento" className="sr-only">Buscar por título ou autor</label>
            <input
              id="busca-gestao-conhecimento"
              name="busca"
              defaultValue={busca}
              placeholder="Título ou autor"
              className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <button type="submit" className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:border-primary/50">
              Buscar
            </button>
          </form>

          {lista.itens.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {aba === 'fila' ? 'Nenhum artigo aguardando aprovação.' : 'Nenhum artigo encontrado.'}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {lista.itens.map((artigo) => (
                <li key={artigo.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={caminhoModeracaoArtigo(artigo.id)} className="font-semibold text-foreground hover:text-primary">
                      {artigo.titulo}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        artigo.tipoAutoria === 'institucional' ? 'Institucional' : artigo.autorNome,
                        artigo.categoria,
                        artigo.enviadaEm ? `enviado em ${formatarData(artigo.enviadaEm)}` : `atualizado em ${formatarData(artigo.atualizadoEm)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {artigo.destaque ? <Star className="size-4 fill-amber-400 text-amber-400" aria-label="Em destaque" /> : null}
                    <SituacaoEditorialBadge situacao={artigo.situacao} />
                    {artigo.revisaoEmAndamento ? <span className="text-xs text-muted-foreground">revisão</span> : null}
                    <Link
                      href={caminhoModeracaoArtigo(artigo.id)}
                      className="alvo-toque-h inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/50"
                    >
                      {artigo.versaoAbertaStatus === 'aguardando_aprovacao' ? 'Analisar' : 'Abrir'}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lista.totalPaginas > 1 ? (
            <nav aria-label="Paginação" className="flex items-center justify-center gap-3 text-sm">
              {lista.pagina > 1 ? (
                <Link href={url({ aba: aba === 'fila' ? undefined : aba, busca, pagina: lista.pagina - 1 })} className="font-semibold text-primary">
                  Anterior
                </Link>
              ) : null}
              <span className="text-muted-foreground">Página {lista.pagina} de {lista.totalPaginas}</span>
              {lista.pagina < lista.totalPaginas ? (
                <Link href={url({ aba: aba === 'fila' ? undefined : aba, busca, pagina: lista.pagina + 1 })} className="font-semibold text-primary">
                  Próxima
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
