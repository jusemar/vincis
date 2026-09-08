'use client'

import { Award, Check, Crown, Gem } from 'lucide-react'
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import {
  DIAS_PROTECAO_DOWNGRADE,
  NIVEIS_PARCEIRO,
  indiceDoNivel,
  percentualFormatado,
  progressoParaProximoNivel,
  type CodigoNivel,
} from '../../constants/programa'

/**
 * Sistema de níveis.
 *
 * A composição é a da referência — medidor radial em cima, trilha de níveis
 * embaixo —, mas a régua é a regra real: três níveis (5% · 7,5% · 10%) e nenhum
 * Diamante. Os requisitos e os percentuais vêm de `constants/programa`, que é o
 * mesmo lugar de onde o Hero e o bloco híbrido leem — dois textos discordando
 * sobre o próprio percentual seria pior do que não mostrá-lo.
 *
 * Cada estado é legível sem depender de cor: o concluído traz o "check", o
 * atual traz a pílula "Atual" em texto e o próximo diz quantos recorrentes
 * faltam.
 *
 * A proteção de 30 dias aparece como **conceito** — a pílula existe e o texto
 * explica —, mas nada conta os dias ainda: não há backend de programa.
 */
const ICONE_DO_NIVEL = {
  bronze: Award,
  prata: Gem,
  ouro: Crown,
} as const

export function CardDeNiveis({
  nivel,
  recorrentesAtivos,
  emProtecao = false,
}: {
  nivel: CodigoNivel
  recorrentesAtivos: number
  emProtecao?: boolean
}) {
  const indiceAtual = indiceDoNivel(nivel)
  const nivelAtual = NIVEIS_PARCEIRO[indiceAtual]
  const { percentual, faltam, proximo } = progressoParaProximoNivel(
    nivel,
    recorrentesAtivos,
  )

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sistema de níveis
        </p>
        <p className="mt-1 flex items-center gap-2 font-serif text-xl font-semibold">
          <Crown className="size-5 text-primary" aria-hidden />
          Você é <span className="text-primary">{nivelAtual.nome}</span>
        </p>
      </div>

      <div className="relative mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ nome: 'progresso', valor: percentual }]}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: 'hsl(var(--muted))' }}
              dataKey="valor"
              cornerRadius={20}
              fill="hsl(var(--primary))"
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-3xl font-semibold leading-none tabular-nums">
            {percentual}%
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            {proximo ? `para ${proximo.nome}` : 'nível máximo'}
          </span>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {NIVEIS_PARCEIRO.map((item, indice) => {
          const concluido = indice < indiceAtual
          const atual = indice === indiceAtual
          const Icone = ICONE_DO_NIVEL[item.codigo]

          return (
            <li
              key={item.codigo}
              aria-current={atual ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
                atual && 'border-primary/40 bg-primary/5',
                !atual && !concluido && 'bg-muted/30',
              )}
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  atual
                    ? 'bg-primary text-primary-foreground'
                    : concluido
                      ? 'bg-success/15 text-success'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                <Icone className="size-4" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.nome}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Comissão {percentualFormatado(item.percentual)} ·{' '}
                  {item.minimoRecorrentes === 0
                    ? 'entrada no programa'
                    : `${item.minimoRecorrentes} recorrentes`}
                </p>
              </div>

              {concluido ? (
                <Check className="size-4 shrink-0 text-success" aria-label="Concluído" />
              ) : null}
              {atual ? <Pilula rotulo="Atual" tom="destaque" /> : null}
              {!atual && !concluido && proximo?.codigo === item.codigo ? (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  faltam {faltam}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>

      {emProtecao ? (
        <div className="mt-4">
          <Pilula
            tom="atencao"
            rotulo={`Proteção · ${DIAS_PROTECAO_DOWNGRADE} dias`}
          />
        </div>
      ) : null}

      <p className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Ao subir de nível, toda a carteira elegível passa ao novo percentual. Se o
        número de recorrentes cair, há {DIAS_PROTECAO_DOWNGRADE} dias de proteção
        antes do rebaixamento.
      </p>
    </section>
  )
}
