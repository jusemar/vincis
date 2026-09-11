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
import { formatarPercentualCentesimos } from '../../constants/programa'
import type { SituacaoDeNivel } from '../../lib/niveis'

/**
 * Sistema de níveis.
 *
 * A composição é a da referência — medidor radial em cima, trilha de níveis
 * embaixo —, e todo número vem do servidor: o nível atual e a contagem de
 * clientes recorrentes ativos do parceiro, e os percentuais, mínimos e dias de
 * proteção da configuração publicada pela Gestão. Nenhum deles está escrito
 * aqui; se a Gestão muda a regra, o card muda junto.
 *
 * Cada estado é legível sem depender de cor: o concluído traz o "check", o
 * atual traz a pílula "Atual" em texto e o próximo diz quantos recorrentes
 * faltam.
 */
const ICONE_DO_NIVEL: Record<string, typeof Award> = {
  bronze: Award,
  prata: Gem,
  ouro: Crown,
}

const DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

function recorrentes(quantidade: number) {
  return `${quantidade} ${quantidade === 1 ? 'recorrente ativo' : 'recorrentes ativos'}`
}

export function CardDeNiveis({ situacao }: { situacao: SituacaoDeNivel | null }) {
  if (!situacao) {
    return (
      <section className="flex h-full flex-col rounded-xl border bg-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sistema de níveis
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Os níveis do programa estão indisponíveis no momento. Assim que a
          configuração for publicada pela Vincis, seu nível aparece aqui.
        </p>
      </section>
    )
  }

  const { nivel, niveis, proximo, progresso, protegidoAte, protecaoDias, clientesAtivos } =
    situacao
  const indiceAtual = niveis.findIndex((item) => item.codigo === nivel.codigo)

  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sistema de níveis
        </p>
        <p className="mt-1 flex items-center gap-2 font-serif text-xl font-semibold">
          <Crown className="size-5 text-primary" aria-hidden />
          Você é <span className="text-primary">{nivel.nome}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatarPercentualCentesimos(nivel.percentualCentesimos)} de comissão
          recorrente · {recorrentes(clientesAtivos)}
        </p>
      </div>

      <div className="relative mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ nome: 'progresso', valor: progresso }]}
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
            {progresso}%
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            {proximo ? `para ${proximo.nome}` : 'nível máximo'}
          </span>
        </div>
      </div>

      {proximo ? (
        <p className="text-center text-xs text-muted-foreground">
          Faltam {proximo.faltam}{' '}
          {proximo.faltam === 1 ? 'cliente recorrente ativo' : 'clientes recorrentes ativos'}{' '}
          para {proximo.nome}.
        </p>
      ) : null}

      <ol className="mt-4 space-y-2.5">
        {niveis.map((item, indice) => {
          const concluido = indice < indiceAtual
          const atual = indice === indiceAtual
          const Icone = ICONE_DO_NIVEL[item.codigo] ?? Award

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
                  Comissão {formatarPercentualCentesimos(item.percentualCentesimos)} ·{' '}
                  {item.minimoClientes === 0
                    ? 'entrada no programa'
                    : recorrentes(item.minimoClientes)}
                </p>
              </div>

              {concluido ? (
                <Check className="size-4 shrink-0 text-success" aria-label="Concluído" />
              ) : null}
              {atual ? <Pilula rotulo="Atual" tom="destaque" /> : null}
              {!atual && !concluido && proximo?.codigo === item.codigo ? (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                  faltam {proximo.faltam}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>

      {protegidoAte ? (
        <div className="mt-4">
          <Pilula tom="atencao" rotulo={`Protegido até ${DIA.format(protegidoAte)}`} />
        </div>
      ) : null}

      <p className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
        Ao subir de nível, as próximas comissões de toda a carteira elegível usam o novo
        percentual. Se o número de recorrentes cair, há {protecaoDias}{' '}
        {protecaoDias === 1 ? 'dia' : 'dias'} de proteção antes do rebaixamento.
      </p>
    </section>
  )
}
