import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Vocabulário visual da Área do Cliente.
 *
 * Não é um segundo design system: cada peça aqui é composta com os **tokens e
 * classes que a Vincis já tem** (`badge-success`, `badge-info`, `muted`,
 * `primary`, `border`, `font-serif`). O que este arquivo acrescenta é a
 * gramática de composição — pouca cor, muito ar, hierarquia por tipografia e
 * hairlines em vez de caixas empilhadas — para que as quatro telas do Cliente
 * pareçam uma coisa só, e não quatro páginas parecidas.
 *
 * Todos os componentes são de servidor por padrão: nenhum deles tem estado. As
 * partes interativas ficam nos componentes que os usam.
 */

export type Tom = 'neutro' | 'info' | 'sucesso' | 'atencao' | 'destaque'

/**
 * Fundo suave + borda da mesma família.
 *
 * `badge-*` já existe no projeto e já é ciente do tema escuro — reaproveitar
 * evita inventar uma segunda paleta e garante que claro e escuro tenham o mesmo
 * nível de acabamento.
 */
const FUNDO_DO_TOM: Record<Tom, string> = {
  neutro: 'bg-muted text-muted-foreground border-border',
  info: 'badge-info',
  sucesso: 'badge-success',
  atencao: 'badge-warning',
  destaque: 'bg-primary/10 text-primary border-primary/25',
}

const PONTO_DO_TOM: Record<Tom, string> = {
  neutro: 'bg-muted-foreground/60',
  info: 'bg-info',
  sucesso: 'bg-success',
  atencao: 'bg-warning',
  destaque: 'bg-primary',
}

/**
 * Status como pílula com ponto.
 *
 * O ponto não é enfeite: é o que permite distinguir os estados sem depender
 * exclusivamente da cor, junto do próprio rótulo em texto.
 */
export function Pilula({
  rotulo,
  tom = 'neutro',
  className,
}: {
  rotulo: string
  tom?: Tom
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        FUNDO_DO_TOM[tom],
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', PONTO_DO_TOM[tom])} />
      {rotulo}
    </span>
  )
}

/** Rótulo de apoio: pequeno, espaçado e discreto. */
export function Sobrenome({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
      {children}
    </p>
  )
}

/**
 * Abertura de uma seção: linha de contexto, título forte e descrição.
 *
 * A régua embaixo separa o cabeçalho do conteúdo sem precisar de uma caixa —
 * é o que mantém a página leve mesmo com muita informação abaixo.
 */
export function CabecalhoSecao({
  contexto,
  titulo,
  descricao,
  acoes,
}: {
  contexto?: string
  titulo: string
  descricao?: string
  acoes?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {contexto ? <Sobrenome>{contexto}</Sobrenome> : null}
        <h1 className="mt-2 font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {titulo}
        </h1>
        {descricao ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {descricao}
          </p>
        ) : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </header>
  )
}

/** Título interno de bloco. Menor que o da seção, para não competir com ele. */
export function TituloDeBloco({
  titulo,
  apoio,
  acao,
}: {
  titulo: string
  apoio?: string
  acao?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        {apoio ? (
          <span className="text-xs text-muted-foreground">{apoio}</span>
        ) : null}
      </div>
      {acao}
    </div>
  )
}

/**
 * Indicadores em fileira, separados por hairline.
 *
 * `gap-px` sobre um fundo de borda desenha as divisórias com um pixel real, em
 * vez de quatro cartões com sombra: quatro caixas competiriam entre si e com o
 * conteúdo que vem logo abaixo.
 */
export function Indicadores({
  itens,
}: {
  itens: { rotulo: string; valor: number | string; href?: string }[]
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      {itens.map((item) => (
        <div key={item.rotulo} className="bg-card px-5 py-4">
          <dt className="text-xs font-medium text-muted-foreground">
            {item.rotulo}
          </dt>
          <dd className="mt-1.5 font-serif text-3xl font-semibold leading-none tabular-nums">
            {item.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Par rótulo/valor, para as fichas de dados. */
export function Dado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        {rotulo}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium">{valor}</dd>
    </div>
  )
}

/**
 * Estado vazio.
 *
 * Borda tracejada e texto centrado: comunica "aqui ainda não há nada" sem
 * parecer um erro nem ocupar o peso visual de um cartão cheio.
 */
export function PainelVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-10 text-center">
      <h3 className="font-serif text-lg font-semibold">{titulo}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {descricao}
      </p>
      {acao ? <div className="mt-4 flex justify-center">{acao}</div> : null}
    </div>
  )
}

export type EventoDaLinhaDoTempo = {
  id: string
  titulo: string
  detalhe?: string | null
  quando: string
  tom?: Tom
}

/**
 * Linha do tempo vertical.
 *
 * Uma régua fina à esquerda e um ponto por evento — sem cartões. É o formato
 * que aguenta muitos itens sem virar uma pilha, e que deixa a data legível sem
 * disputar espaço com o texto.
 */
export function LinhaDoTempo({ eventos }: { eventos: EventoDaLinhaDoTempo[] }) {
  return (
    <ol className="relative space-y-5 border-l pl-6">
      {eventos.map((evento) => (
        <li key={evento.id} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute -left-[1.72rem] top-1.5 size-2.5 rounded-full ring-4 ring-card',
              PONTO_DO_TOM[evento.tom ?? 'neutro'],
            )}
          />
          <p className="text-sm font-medium">{evento.titulo}</p>
          {evento.detalhe ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{evento.detalhe}</p>
          ) : null}
          <time className="mt-1 block text-xs tabular-nums text-muted-foreground/80">
            {evento.quando}
          </time>
        </li>
      ))}
    </ol>
  )
}

/** Superfície padrão do conteúdo: borda fina, sem sombra pesada. */
export function Superficie({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card', className)}>
      {children}
    </section>
  )
}

/** Barra de progresso do checklist público. */
export function Progresso({
  percentual,
  rotulo,
}: {
  percentual: number
  rotulo: string
}) {
  return (
    <div className="min-w-32 flex-1">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <span className="tabular-nums">{percentual}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={rotulo}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Trilha de etapas concluídas / atual / futuras.
 *
 * Existe para responder "onde estou e o que falta" numa olhada, sem empilhar
 * cartões: as etapas futuras aparecem apagadas em vez de escondidas, porque
 * esconder o que falta é exatamente o que faz alguém achar que já terminou.
 *
 * Não depende só de cor: a etapa concluída ganha o ponto preenchido, a atual
 * ganha o anel, e todas trazem o rótulo em texto.
 */
export function Trilha({
  passos,
  atual,
}: {
  passos: readonly { rotulo: string }[]
  /** Índice da etapa atual. `-1` quando nenhuma começou. */
  atual: number
}) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
      {passos.map((passo, indice) => {
        const concluido = indice < atual
        const ehAtual = indice === atual
        return (
          <li
            key={passo.rotulo}
            className="flex flex-1 items-center gap-2.5"
            aria-current={ehAtual ? 'step' : undefined}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                concluido && 'border-success bg-success',
                ehAtual && 'border-primary ring-4 ring-primary/15',
                !concluido && !ehAtual && 'border-muted-foreground/30',
              )}
            >
              {concluido ? (
                <svg viewBox="0 0 12 12" className="size-3 text-success-foreground">
                  <path
                    d="M2.5 6.2 4.8 8.5 9.5 3.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </span>
            <span
              className={cn(
                'text-sm',
                ehAtual && 'font-semibold text-foreground',
                concluido && 'font-medium text-foreground',
                !concluido && !ehAtual && 'text-muted-foreground',
              )}
            >
              {passo.rotulo}
            </span>
            {indice < passos.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'ml-1 hidden h-px flex-1 sm:block',
                  concluido ? 'bg-success/50' : 'bg-border',
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
