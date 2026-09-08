'use client'

import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUpRight,
  BadgeDollarSign,
  RefreshCw,
  Repeat,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { KPIS_PARCEIRO, type KpiParceiro } from '../../constants/mock-painel'
import { NumeroAnimado } from './NumeroAnimado'

/**
 * A fileira de indicadores do painel.
 *
 * Seis cartões, na fileira única da referência quando há largura para isso
 * (`2xl`, a partir de 1536px) e em duas fileiras de três antes disso — abaixo
 * de ~1400px seis colunas deixariam menos de 200px por cartão, estreito demais
 * para um número de quatro dígitos com rótulo.
 *
 * Duas tintas apenas, com **critério**: azul (`info`) é recorrência, âmbar
 * (`primary`) é o resto. É a mesma regra do gráfico e do bloco híbrido — cor
 * aqui informa, não decora.
 */
const ICONES: Record<string, LucideIcon> = {
  wallet: Wallet,
  repeat: Repeat,
  users: Users,
  refresh: RefreshCw,
  target: Target,
  moeda: BadgeDollarSign,
}

const TINTA = {
  primary: {
    fundo: 'bg-primary/10',
    icone: 'text-primary',
    halo: 'hsl(var(--primary) / 0.25)',
  },
  info: {
    fundo: 'bg-info/10',
    icone: 'text-info',
    halo: 'hsl(var(--info) / 0.22)',
  },
} as const

function CartaoIndicador({ kpi, ordem }: { kpi: KpiParceiro; ordem: number }) {
  const semMovimento = useReducedMotion()
  const Icone = ICONES[kpi.icone] ?? Wallet
  const tinta = TINTA[kpi.tom as keyof typeof TINTA] ?? TINTA.primary

  return (
    <motion.div
      initial={semMovimento ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={semMovimento ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22, delay: ordem * 0.04 }}
      className="group relative overflow-hidden rounded-xl border bg-card p-5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-40 blur-3xl transition-opacity group-hover:opacity-70"
        style={{ background: `radial-gradient(circle, ${tinta.halo}, transparent 65%)` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl',
            tinta.fundo,
          )}
        >
          <Icone className={cn('size-5', tinta.icone)} aria-hidden />
        </span>
        {'variacao' in kpi && kpi.variacao != null ? (
          <span className="flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-[11px] font-medium text-success">
            <ArrowUpRight className="size-3" aria-hidden />+{kpi.variacao}%
          </span>
        ) : null}
      </div>

      <div className="relative mt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {kpi.rotulo}
        </p>
        <p className="mt-1 font-serif text-3xl font-semibold leading-none">
          <NumeroAnimado
            valor={kpi.valor}
            prefixo={'prefixo' in kpi ? kpi.prefixo : ''}
            sufixo={'sufixo' in kpi ? kpi.sufixo : ''}
          />
        </p>
        {kpi.apoio ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{kpi.apoio}</p>
        ) : null}
      </div>
    </motion.div>
  )
}

export function IndicadoresDoParceiro() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {KPIS_PARCEIRO.map((kpi, indice) => (
        <CartaoIndicador key={kpi.id} kpi={kpi} ordem={indice} />
      ))}
    </div>
  )
}
