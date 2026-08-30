'use client'

import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * As peças de que toda seção da Precificação é feita.
 *
 * O Gestor não administra tabelas: ele responde perguntas de negócio — "quanto
 * custa a rotina de um Simples Nacional?", "quanto a mais custa a indústria?".
 * Por isso a unidade visual daqui é o **campo com rótulo em português e
 * unidade visível** (R$ ou %), e não a célula de uma grade com colunas
 * técnicas. Nenhum componente desta pasta exibe código, id ou milésimo.
 */

/** Texto do campo → número. Aceita a vírgula que o teclado brasileiro produz. */
export function paraNumero(texto: string): number {
  const limpo = texto.replace(/\s/g, '').replace(',', '.')
  return limpo === '' ? Number.NaN : Number(limpo)
}

/** Número → texto do campo, sem casas decimais inúteis. */
export function paraTexto(valor: number): string {
  return String(valor).replace('.', ',')
}

/**
 * Cartão de uma seção, com o próprio botão de salvar.
 *
 * O botão só acorda quando alguma coisa mudou: um "Salvar" sempre disponível
 * convida a gravar sem querer, e cada gravação aqui muda o preço que a vitrine
 * pública exibe no instante seguinte.
 */
export function SecaoCard({
  titulo,
  descricao,
  children,
  rodape,
  alterado,
  salvando,
  onSalvar,
  onDesfazer,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
  rodape?: React.ReactNode
  alterado: boolean
  salvando: boolean
  onSalvar: () => void
  onDesfazer: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          {descricao ? (
            <p className="text-sm text-muted-foreground">{descricao}</p>
          ) : null}
        </div>

        <div className="space-y-3">{children}</div>

        {rodape ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {rodape}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button onClick={onSalvar} disabled={!alterado || salvando}>
            {salvando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Salvar
          </Button>
          {alterado && !salvando ? (
            <Button variant="ghost" onClick={onDesfazer}>
              Descartar alterações
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {salvando
              ? 'Salvando…'
              : alterado
                ? 'Alterações ainda não salvas'
                : 'Tudo salvo'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Uma linha "pergunta → valor".
 *
 * A unidade fica dentro do campo, à esquerda em dinheiro e à direita em
 * porcentagem, como se escreve nos dois casos. `apoio` é o lugar do número que
 * o Gestor precisa ver sem poder editar — o preço resultante, por exemplo.
 */
export function LinhaValor({
  id,
  rotulo,
  ajuda,
  unidade,
  valor,
  onChange,
  apoio,
  desabilitado,
}: {
  id: string
  rotulo: string
  ajuda?: string
  unidade: 'reais' | 'porcento'
  valor: string
  onChange: (v: string) => void
  apoio?: React.ReactNode
  desabilitado?: boolean
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {rotulo}
        </Label>
        {ajuda ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{ajuda}</p>
        ) : null}
        {apoio ? <div className="mt-1 text-xs text-primary">{apoio}</div> : null}
      </div>

      <div className="relative">
        {unidade === 'reais' ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
          </span>
        ) : (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        )}
        <Input
          id={id}
          value={valor}
          inputMode="decimal"
          disabled={desabilitado}
          onChange={(evento) => onChange(evento.target.value)}
          className={`tabular-nums ${unidade === 'reais' ? 'pl-9' : 'pr-8'}`}
        />
      </div>
    </div>
  )
}

/** Um número que o Gestor só lê: resultado, composição, referência. */
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
      className={`rounded-lg px-3 py-2 ${destaque ? 'bg-primary/10' : 'bg-muted/60'}`}
    >
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={`text-base font-semibold tabular-nums ${destaque ? 'text-primary' : 'text-foreground'}`}
      >
        {valor}
      </p>
    </div>
  )
}
