'use client'

import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * As primitivas da tela de Precificação.
 *
 * São a tradução direta de `components/admin/primitives.tsx` do protótipo que
 * serviu de referência — mesmo nome, mesma anatomia, mesmas medidas — escritas
 * sobre os componentes e os tokens do Vincis. O protótipo não trouxe paleta
 * nenhuma junto: cor, raio, sombra e foco continuam sendo os do projeto, e é
 * por isso que a tela se parece com ele sem deixar de pertencer a esta casa.
 */

export function CabecalhoSecao({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {titulo}
        </h2>
        {descricao ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>
        ) : null}
      </div>
      {acao}
    </div>
  )
}

export function Painel({
  titulo,
  descricao,
  children,
  className,
  aside,
}: {
  titulo?: string
  descricao?: string
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card p-5 shadow-sm sm:p-6',
        className,
      )}
    >
      {titulo || aside ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo ? (
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {titulo}
              </h3>
            ) : null}
            {descricao ? (
              <p className="mt-1.5 text-sm text-muted-foreground/90">{descricao}</p>
            ) : null}
          </div>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Campo({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}
    </div>
  )
}

/**
 * Campo numérico com a unidade colada nele.
 *
 * `prefixo` nulo tira o "R$" — é como o multiplicador e a ordem aparecem. O
 * campo aceita a vírgula do teclado brasileiro; a conversão para centavos e
 * milésimos acontece na hora de salvar, nunca aqui.
 */
export function CampoNumero({
  id,
  valor,
  onChange,
  prefixo = 'R$',
  sufixo,
  somenteLeitura,
  desabilitado,
  className,
}: {
  id?: string
  valor: string
  onChange?: (v: string) => void
  prefixo?: string | null
  sufixo?: string
  somenteLeitura?: boolean
  desabilitado?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      {prefixo ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {prefixo}
        </span>
      ) : null}
      <Input
        id={id}
        value={valor}
        readOnly={somenteLeitura}
        disabled={desabilitado}
        inputMode="decimal"
        onChange={(evento) => onChange?.(evento.target.value)}
        className={cn(
          'h-9 bg-background tabular-nums',
          prefixo ? 'pl-10' : '',
          sufixo ? 'pr-12' : '',
          somenteLeitura ? 'text-muted-foreground' : '',
        )}
      />
      {sufixo ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {sufixo}
        </span>
      ) : null}
    </div>
  )
}

/** Campo de texto que hoje só se lê. Ver `AvisoSemPersistencia`. */
export function CampoTexto({
  valor,
  className,
}: {
  valor: string
  className?: string
}) {
  return (
    <Input
      value={valor}
      readOnly
      className={cn('h-9 bg-background text-muted-foreground', className)}
    />
  )
}

/**
 * O aviso de que um bloco é conteúdo, e não configuração.
 *
 * Algumas informações que o protótipo mostrava como editáveis — nome do
 * serviço, textos da página, tabela comparativa — moram no código do Vincis, e
 * não em `precificacao_*`. Elas aparecem aqui porque fazem parte da mesma
 * conversa, mas com a origem declarada: inventar um campo que grava em lugar
 * nenhum seria pior do que não mostrá-lo.
 */
export function AvisoSemPersistencia({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}
