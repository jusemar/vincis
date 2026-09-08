'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import {
  PERIODOS_GRAFICO,
  RESUMO_COMISSOES,
  serieDeComissoes,
  type PeriodoGrafico,
} from '../../constants/mock-painel'
import { NumeroAnimado } from './NumeroAnimado'

/**
 * Evolução das comissões.
 *
 * Duas séries, como na referência — o total ganho e a parte recorrente —,
 * porque a diferença entre as duas é a história que o programa conta: uma sobe
 * e desce com o esforço do mês, a outra só sobe.
 *
 * As cores saem dos tokens (`--primary` e `--info`), e não de valores fixos:
 * é o que faz o gráfico continuar legível quando o tema vira escuro. O mesmo
 * vale para a grade, os eixos e o balão do tooltip.
 *
 * O seletor de período troca a série de verdade — cada faixa tem a própria
 * granularidade. Um seletor que não muda nada é pior do que nenhum.
 */
export function GraficoDeComissoes() {
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('12M')
  const dados = useMemo(() => serieDeComissoes(periodo), [periodo])

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Evolução de comissões
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold leading-none">
            <NumeroAnimado valor={RESUMO_COMISSOES.acumulado} prefixo="R$ " />
          </p>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-success">
            <ArrowUpRight className="size-3" aria-hidden />+
            {RESUMO_COMISSOES.variacao}% {RESUMO_COMISSOES.comparacao}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Período do gráfico"
          className="flex gap-1 text-xs"
        >
          {PERIODOS_GRAFICO.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === periodo}
              onClick={() => setPeriodo(item)}
              className={cn(
                'alvo-toque-h rounded-lg px-3 py-1.5 font-medium transition-colors',
                item === periodo
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-2 mt-4 min-h-64 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="parceiros-ganhos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="parceiros-recorrente" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="etiqueta"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(valor: number) => `R$${(valor / 1000).toFixed(1)}k`}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))' }}
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                color: 'hsl(var(--popover-foreground))',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={(valor: number, chave: string) => [
                valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                chave === 'ganhos' ? 'Ganhos totais' : 'Renda recorrente',
              ]}
            />
            <Area
              type="monotone"
              dataKey="ganhos"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#parceiros-ganhos)"
            />
            <Area
              type="monotone"
              dataKey="recorrente"
              stroke="hsl(var(--info))"
              strokeWidth={2.5}
              fill="url(#parceiros-recorrente)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-5 px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-primary" /> Ganhos totais
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-info" /> Renda recorrente
        </span>
      </div>
    </section>
  )
}
