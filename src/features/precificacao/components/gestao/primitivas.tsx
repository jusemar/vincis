'use client'

import type { ReactNode } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * As peças da Precificação administrativa.
 *
 * ## Densidade é requisito, não estética
 *
 * O Gestor não configura um valor por vez: ele percorre oito preços-base,
 * doze faixas e oito acréscimos numa sessão só. Um cartão por configuração
 * transformava isso em metros de rolagem. Aqui a unidade é a **linha de
 * tabela** — rótulo à esquerda, campo estreito à direita, altura de 36px — e o
 * cartão volta a ser o que deveria ser: o agrupamento de um assunto.
 *
 * ## O que continua sendo do Vincis
 *
 * Tudo o que se vê: `Input`, `Button`, `Label` e `Switch` são os componentes do
 * projeto, e cor, raio, sombra e foco vêm dos tokens. A referência que
 * inspirou o layout não trouxe nenhuma paleta junto.
 */

/** Título de uma seção, com espaço para uma ação à direita. */
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
        <h2 className="text-base font-semibold tracking-tight text-foreground">
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

/**
 * O agrupamento de um assunto, com o próprio botão de salvar.
 *
 * O botão só acorda quando algo mudou naquele bloco: um "Salvar" sempre
 * disponível convida a gravar sem querer, e cada gravação aqui muda o preço
 * que a vitrine pública exibe no instante seguinte.
 */
export function Painel({
  titulo,
  descricao,
  children,
  rodape,
  alterado,
  salvando,
  onSalvar,
  onDescartar,
  className,
}: {
  titulo?: string
  descricao?: string
  children: ReactNode
  rodape?: ReactNode
  alterado?: boolean
  salvando?: boolean
  onSalvar?: () => void
  onDescartar?: () => void
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card p-4 shadow-sm sm:p-5',
        className,
      )}
    >
      {titulo ? (
        <div className="mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {titulo}
          </h3>
          {descricao ? (
            <p className="mt-1 text-sm text-muted-foreground/90">{descricao}</p>
          ) : null}
        </div>
      ) : null}

      {children}

      {rodape ? (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {rodape}
        </p>
      ) : null}

      {onSalvar ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <Button size="sm" onClick={onSalvar} disabled={!alterado || salvando}>
            {salvando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Salvar
          </Button>
          {alterado && !salvando && onDescartar ? (
            <Button size="sm" variant="ghost" onClick={onDescartar}>
              <RotateCcw className="size-3.5" />
              Descartar
            </Button>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {salvando
              ? 'Salvando…'
              : alterado
                ? 'Alterações ainda não salvas'
                : 'Tudo salvo'}
          </span>
        </div>
      ) : null}
    </section>
  )
}

/** Campo com unidade dentro: R$ à esquerda, % à direita, como se escreve. */
export function CampoValor({
  id,
  unidade,
  valor,
  onChange,
  desabilitado,
  className,
}: {
  id: string
  unidade: 'reais' | 'porcento'
  valor: string
  onChange: (v: string) => void
  desabilitado?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      {unidade === 'reais' ? (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          R$
        </span>
      ) : (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      )}
      <Input
        id={id}
        value={valor}
        inputMode="decimal"
        disabled={desabilitado}
        onChange={(evento) => onChange(evento.target.value)}
        className={cn(
          'h-9 bg-background text-right tabular-nums',
          unidade === 'reais' ? 'pl-9' : 'pr-7',
        )}
      />
    </div>
  )
}

/**
 * Uma linha "pergunta → valor".
 *
 * Em telas estreitas o rótulo e o campo empilham; a partir de `sm` o campo vai
 * para uma coluna fixa e estreita, o que alinha todos os valores da tabela na
 * vertical e deixa a comparação entre eles imediata.
 */
export function LinhaConfig({
  id,
  rotulo,
  ajuda,
  apoio,
  children,
  primeira,
}: {
  id?: string
  rotulo: string
  ajuda?: string
  apoio?: ReactNode
  children: ReactNode
  primeira?: boolean
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_10rem]',
        primeira ? '' : 'border-t border-border/60',
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {rotulo}
        </Label>
        {ajuda ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {ajuda}
          </p>
        ) : null}
        {apoio ? <div className="mt-0.5 text-[11px] text-primary">{apoio}</div> : null}
      </div>
      {children}
    </div>
  )
}

/** Um número que o Gestor só lê. */
export function ValorLido({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg px-3 py-2',
        destaque ? 'bg-primary/10' : 'bg-muted/60',
      )}
    >
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          'text-sm font-semibold tabular-nums',
          destaque ? 'text-primary' : 'text-foreground',
        )}
      >
        {valor}
      </p>
    </div>
  )
}
