'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, ListTree, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CAPITULOS_MANUAL,
  DATA_DO_LEVANTAMENTO,
  TITULO_MANUAL,
} from '../constants/conteudo'
import { SITUACAO, SITUACOES } from '../constants/situacao'
import { buscarNoManual, termosDaBusca } from '../lib/busca'
import { PARTES_MANUAL } from '../types/manual'
import { BlocoDoManual } from './BlocoDoManual'
import { SeloDeSituacao } from './SeloDeSituacao'

/**
 * O Manual da Vincis, dentro do painel do Gestor.
 *
 * Todo o conteúdo já chega com a página: índice, busca e navegação acontecem
 * no navegador, sem nenhuma consulta. Quem decide se a pessoa pode ver esta
 * tela é a rota, no servidor — este componente só desenha.
 */
const ID_TOPO = 'manual-topo'
const ID_BUSCA = 'manual-busca'

export function ManualDaVincis() {
  const [consulta, setConsulta] = useState('')
  const consultaAdiada = useDeferredValue(consulta)
  const [capituloAtivo, setCapituloAtivo] = useState(CAPITULOS_MANUAL[0].id)
  // No celular o índice é uma gaveta: escolher um capítulo a fecha.
  const indiceMobile = useRef<HTMLDetailsElement>(null)

  const buscando = termosDaBusca(consultaAdiada).length > 0
  const resultados = useMemo(
    () => buscarNoManual(CAPITULOS_MANUAL, consultaAdiada),
    [consultaAdiada],
  )
  const totalDeBlocos = resultados.reduce((soma, r) => soma + r.blocos.length, 0)

  // Acende no índice o capítulo que está na tela.
  useEffect(() => {
    const secoes = CAPITULOS_MANUAL.map(({ id }) => document.getElementById(id)).filter(
      (secao): secao is HTMLElement => secao !== null,
    )
    if (!secoes.length || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visivel) setCapituloAtivo(visivel.target.id)
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    secoes.forEach((secao) => observador.observe(secao))
    return () => observador.disconnect()
  }, [resultados])

  const numeroDo = (id: string) => CAPITULOS_MANUAL.findIndex((c) => c.id === id) + 1

  return (
    <div id={ID_TOPO} className="mx-auto flex w-full max-w-7xl scroll-mt-4 flex-col gap-6">
      {/* Abertura */}
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Exclusivo do Gestor · Levantamento de {DATA_DO_LEVANTAMENTO}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-balance sm:text-3xl">{TITULO_MANUAL}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
            Como a Vincis funciona hoje, explicado do ponto de vista de quem usa: o que
            Cliente, Profissional, Colaborador, Parceiro e Gestor veem e fazem, como testar
            cada recurso e como ajudar quem tiver dúvidas ou problemas.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Legenda de situação">
          {SITUACOES.map((situacao) => (
            <div
              key={situacao}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3.5 py-3"
            >
              <SeloDeSituacao situacao={situacao} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {SITUACAO[situacao].significado}
              </p>
            </div>
          ))}
        </div>

        <div className="relative">
          <label htmlFor={ID_BUSCA} className="sr-only">
            Buscar no manual
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={ID_BUSCA}
            type="search"
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            placeholder="Buscar no manual — ex.: senha, protocolo, saque, lembrete"
            className="h-11 bg-card pr-10 pl-9"
            autoComplete="off"
          />
          {consulta ? (
            <button
              type="button"
              onClick={() => setConsulta('')}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        {buscando ? (
          <p className="-mt-2 text-sm text-muted-foreground" aria-live="polite">
            {resultados.length
              ? `${totalDeBlocos} ${totalDeBlocos === 1 ? 'trecho encontrado' : 'trechos encontrados'} em ${resultados.length} ${resultados.length === 1 ? 'capítulo' : 'capítulos'}.`
              : 'Nada encontrado. Tente outra palavra ou confira a grafia.'}
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        {/* Índice */}
        <nav aria-label="Capítulos do manual" className="lg:sticky lg:top-0 lg:self-start">
          <details ref={indiceMobile} className="group rounded-xl border border-border bg-card lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <ListTree className="size-4 text-primary" />
                Índice de capítulos
              </span>
              <span className="text-xs text-muted-foreground">
                {buscando ? `${resultados.length} com resultados` : `${CAPITULOS_MANUAL.length} capítulos`}
              </span>
            </summary>
            <div className="border-t border-border px-2 py-2">
              <IndiceDeCapitulos
                resultados={resultados.map((r) => r.capitulo.id)}
                ativo={capituloAtivo}
                numeroDo={numeroDo}
                aoEscolher={() => indiceMobile.current?.removeAttribute('open')}
              />
            </div>
          </details>
          <div className="hidden max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1 lg:block">
            <p className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold">
              <BookOpen className="size-4 text-primary" /> Índice
            </p>
            <IndiceDeCapitulos
              resultados={resultados.map((r) => r.capitulo.id)}
              ativo={capituloAtivo}
              numeroDo={numeroDo}
            />
          </div>
        </nav>

        {/* Capítulos */}
        <div className="flex min-w-0 flex-col gap-12">
          {resultados.map(({ capitulo, blocos }) => {
            const numero = numeroDo(capitulo.id)
            const anterior = CAPITULOS_MANUAL[numero - 2]
            const proximo = CAPITULOS_MANUAL[numero]
            return (
              <section
                key={capitulo.id}
                id={capitulo.id}
                aria-labelledby={`${capitulo.id}-titulo`}
                className="scroll-mt-4"
              >
                <header className="mb-5 border-b border-border pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Capítulo {numero} · {capitulo.parte}
                  </p>
                  <h2 id={`${capitulo.id}-titulo`} className="mt-1.5 text-xl font-bold text-balance sm:text-2xl">
                    {capitulo.titulo}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{capitulo.resumo}</p>
                </header>

                <div className="flex flex-col gap-4">
                  {blocos.map((indice) => (
                    <BlocoDoManual key={indice} bloco={capitulo.blocos[indice]} />
                  ))}
                </div>

                {!buscando ? (
                  <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    {anterior ? (
                      <Button asChild variant="ghost" size="sm" className="max-w-full">
                        <a href={`#${anterior.id}`}>
                          <ArrowLeft className="size-4" />
                          <span className="truncate">{anterior.titulo}</span>
                        </a>
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button asChild variant="ghost" size="sm">
                      <a href={`#${ID_TOPO}`}>
                        <ArrowUp className="size-4" /> Índice e busca
                      </a>
                    </Button>
                    {proximo ? (
                      <Button asChild variant="outline" size="sm" className="max-w-full">
                        <a href={`#${proximo.id}`}>
                          <span className="truncate">{proximo.titulo}</span>
                          <ArrowRight className="size-4" />
                        </a>
                      </Button>
                    ) : null}
                  </footer>
                ) : null}
              </section>
            )
          })}

          {buscando && !resultados.length ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="font-medium">Nenhum trecho do manual tem essas palavras.</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setConsulta('')}>
                Limpar busca
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function IndiceDeCapitulos({
  resultados,
  ativo,
  numeroDo,
  aoEscolher,
}: {
  resultados: string[]
  ativo: string
  numeroDo: (id: string) => number
  aoEscolher?: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {PARTES_MANUAL.map((parte) => {
        const capitulos = CAPITULOS_MANUAL.filter((c) => c.parte === parte)
        return (
          <div key={parte}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {parte}
            </p>
            <ol className="flex flex-col">
              {capitulos.map((capitulo) => {
                const encontrado = resultados.includes(capitulo.id)
                const atual = ativo === capitulo.id
                return (
                  <li key={capitulo.id}>
                    <a
                      href={`#${capitulo.id}`}
                      onClick={aoEscolher}
                      aria-current={atual ? 'location' : undefined}
                      className={cn(
                        'flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                        atual
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        !encontrado && 'pointer-events-none opacity-40',
                      )}
                      aria-disabled={!encontrado || undefined}
                      tabIndex={encontrado ? undefined : -1}
                    >
                      <span className={cn('w-5 shrink-0 text-right text-xs tabular-nums', atual && 'text-primary')}>
                        {numeroDo(capitulo.id)}
                      </span>
                      <span>{capitulo.titulo}</span>
                    </a>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </div>
  )
}
