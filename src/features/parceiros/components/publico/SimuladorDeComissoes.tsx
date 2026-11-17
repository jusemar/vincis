'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, Briefcase, Info, Minus, Plus, Repeat } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatarPercentualCentesimos, PERCENTUAL_AVULSO } from '../../constants/programa'
import {
  formatarReais,
  lerReaisEmCentavos,
  LIMITES_SIMULACAO,
  simularAvulso,
  simularRecorrente,
  type NivelSimulavel,
} from '../../lib/simulacao'
import { ValorAnimado } from './ValorAnimado'

/**
 * Simulador de comissões — estimativa, nunca promessa.
 *
 * Duas abas porque são duas regras: **recorrente** (planos contábeis, percentual
 * do nível, por cliente ativo por mês) e **avulsa** (serviço do catálogo,
 * percentual fixo por contratação). Os percentuais recorrentes vêm da
 * configuração publicada pela Gestão; a conta é a mesma do motor
 * (`lib/simulacao.ts` → `lib/calculo.ts`), em centavos inteiros.
 */

type Aba = 'recorrente' | 'avulso'

const CENTAVOS_EXEMPLO_MENSALIDADE = 300_00
const CENTAVOS_EXEMPLO_SERVICO = 500_00

/* --------------------------------- campos ---------------------------------- */

function CampoContador({ rotulo, ajuda, valor, min, max, aoMudar }: { rotulo: string; ajuda?: string; valor: number; min: number; max: number; aoMudar: (n: number) => void }) {
  const id = useId()
  const ajustar = (n: number) => aoMudar(Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min)))
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{rotulo}</label>
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => ajustar(valor - 1)} disabled={valor <= min} aria-label={`Diminuir ${rotulo}`} className="alvo-toque grid place-items-center rounded-xl border border-border transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={valor}
          aria-describedby={ajuda ? `${id}-ajuda` : undefined}
          onChange={(e) => ajustar(Number(e.target.value))}
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-center text-lg font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="button" onClick={() => ajustar(valor + 1)} disabled={valor >= max} aria-label={`Aumentar ${rotulo}`} className="alvo-toque grid place-items-center rounded-xl border border-border transition hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      <input type="range" min={min} max={max} value={valor} onChange={(e) => ajustar(Number(e.target.value))} aria-label={`${rotulo} (controle deslizante)`} className="mt-3 w-full accent-[hsl(var(--primary))]" />
    </div>
  )
}

function CampoReais({ rotulo, ajuda, centavos, aoMudar }: { rotulo: string; ajuda?: string; centavos: number; aoMudar: (c: number) => void }) {
  const id = useId()
  const [texto, setTexto] = useState(() => (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">{rotulo}</label>
      {ajuda && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
      <div className="mt-2 flex items-center rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
        <span className="pl-3 text-sm text-muted-foreground" aria-hidden="true">R$</span>
        <input
          id={id}
          inputMode="decimal"
          value={texto}
          aria-describedby={ajuda ? `${id}-ajuda` : undefined}
          onChange={(e) => {
            setTexto(e.target.value)
            aoMudar(lerReaisEmCentavos(e.target.value))
          }}
          onBlur={() => setTexto((centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}
          className="h-11 w-full min-w-0 rounded-xl bg-transparent px-2 text-lg font-semibold tabular-nums text-foreground focus-visible:outline-none"
        />
      </div>
    </div>
  )
}

function Resultado({ rotulo, centavos, destaque = false, nota }: { rotulo: string; centavos: number; destaque?: boolean; nota?: string }) {
  return (
    <div className={cn('rounded-2xl border p-4', destaque ? 'border-primary/40 bg-primary/10' : 'border-border bg-card')}>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <ValorAnimado centavos={centavos} className="mt-1 block text-2xl font-semibold tabular-nums text-foreground" />
      {nota && <div className="mt-1 text-[11px] text-muted-foreground">{nota}</div>}
    </div>
  )
}

/* ------------------------------- recorrente -------------------------------- */

function TrilhaDeNiveis({ niveis, clientes, atual }: { niveis: readonly NivelSimulavel[]; clientes: number; atual: NivelSimulavel }) {
  const topo = Math.max(niveis.at(-1)?.minimoClientes ?? 1, 1)
  const escala = Math.max(topo * 1.25, clientes, 1)
  const pos = (n: number) => `${Math.min(100, (n / escala) * 100)}%`
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-muted" aria-hidden="true">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-gold" animate={{ width: pos(clientes) }} transition={{ duration: 0.4 }} />
        {niveis.map((n) => (
          <span key={n.codigo} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground/60" style={{ left: pos(n.minimoClientes) }} />
        ))}
      </div>
      <div className="relative mt-2 h-8 text-[10px] text-muted-foreground" aria-hidden="true">
        {niveis.map((n) => (
          <span key={n.codigo} className={cn('absolute -translate-x-1/2 whitespace-nowrap text-center', n.codigo === atual.codigo && 'font-semibold text-foreground')} style={{ left: pos(n.minimoClientes) }}>
            {n.nome}
            <br />
            {n.minimoClientes}+
          </span>
        ))}
      </div>
    </div>
  )
}

function SimuladorRecorrente({ niveis, protecaoDias }: { niveis: readonly NivelSimulavel[]; protecaoDias: number }) {
  const [clientes, setClientes] = useState(4)
  const [mensalidade, setMensalidade] = useState(CENTAVOS_EXEMPLO_MENSALIDADE)
  const [meses, setMeses] = useState(6)
  const r = simularRecorrente(niveis, { clientesAtivos: clientes, mensalidadeCentavos: mensalidade, meses })
  if (!r) return null

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 rounded-3xl border border-border bg-card p-5 sm:p-6 lg:col-span-2">
        <CampoContador
          rotulo="Clientes recorrentes ativos"
          ajuda="Clientes indicados por você com plano contábil ativo, prestado e pago no mês. Não é o número de indicações."
          valor={clientes}
          min={0}
          max={60}
          aoMudar={setClientes}
        />
        <CampoReais
          rotulo="Mensalidade média do plano"
          ajuda="Valor de exemplo. Ajuste para o plano que seus indicados contratariam (veja Planos e Preços)."
          centavos={mensalidade}
          aoMudar={setMensalidade}
        />
        <CampoContador rotulo="Período da projeção (meses)" valor={meses} min={1} max={LIMITES_SIMULACAO.mesesMax} aoMudar={setMeses} />
      </div>

      <div className="space-y-4 lg:col-span-3">
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Nível alcançado</span>
            <span className="rounded-full bg-gradient-gold px-3 py-1 text-sm font-semibold text-on-primary">
              {r.nivel.nome} · {formatarPercentualCentesimos(r.nivel.percentualCentesimos)}
            </span>
          </div>
          <TrilhaDeNiveis niveis={niveis} clientes={clientes} atual={r.nivel} />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {r.proximo
              ? `Faltam ${r.proximo.faltamClientes} ${r.proximo.faltamClientes === 1 ? 'cliente recorrente ativo' : 'clientes recorrentes ativos'} para ${r.proximo.nivel.nome} (${formatarPercentualCentesimos(r.proximo.nivel.percentualCentesimos)}).`
              : `Você está no nível mais alto publicado.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          <Resultado rotulo="Por cliente, por mês" centavos={r.comissaoPorClienteCentavos} nota={`${formatarPercentualCentesimos(r.nivel.percentualCentesimos)} de ${formatarReais(mensalidade)}`} />
          <Resultado rotulo="Estimativa mensal" centavos={r.mensalCentavos} destaque nota={`${clientes} × ${formatarReais(r.comissaoPorClienteCentavos)}`} />
          <Resultado rotulo={`Em ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}, se nada mudar`} centavos={r.acumuladoCentavos} nota="Não é valor garantido" />
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Premissas desta estimativa</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Todos os clientes permanecem ativos o período inteiro, com a mesma mensalidade.</li>
            <li>Cada mês é prestado e pago. Mês não prestado, pagamento pendente, estornado ou cancelado não gera comissão.</li>
            <li>O percentual é o da configuração publicada hoje pela Vincis, que pode mudar; comissões já geradas mantêm o percentual delas.</li>
            {protecaoDias > 0 && (
              <li>Para quem já é parceiro, há proteção de {protecaoDias} {protecaoDias === 1 ? 'dia' : 'dias'} antes de cair de nível. Esta simulação considera a entrada, sem histórico.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------- avulso ---------------------------------- */

function SimuladorAvulso() {
  const [valor, setValor] = useState(CENTAVOS_EXEMPLO_SERVICO)
  const [quantidade, setQuantidade] = useState(1)
  const r = simularAvulso({ valorServicoCentavos: valor, quantidade })
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 rounded-3xl border border-border bg-card p-5 sm:p-6 lg:col-span-2">
        <CampoReais rotulo="Valor do serviço" ajuda="Valor de exemplo de um serviço do catálogo, contratado e pago pela Vincis." centavos={valor} aoMudar={setValor} />
        <CampoContador rotulo="Contratações" ajuda="Quantos serviços seus indicados contratariam." valor={quantidade} min={0} max={LIMITES_SIMULACAO.contratacoesMax} aoMudar={setQuantidade} />
      </div>
      <div className="space-y-4 lg:col-span-3">
        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          <Resultado rotulo="Por contratação" centavos={r.porContratacaoCentavos} nota={`${r.percentual}% de ${formatarReais(valor)}`} />
          <Resultado rotulo="Total estimado" centavos={r.totalCentavos} destaque nota={`${r.quantidade} × ${formatarReais(r.porContratacaoCentavos)}`} />
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Como a comissão avulsa funciona</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>{PERCENTUAL_AVULSO}% do valor do serviço, para qualquer nível.</li>
            <li>É gerada quando a contratação é paga e fica disponível quando o serviço é concluído.</li>
            <li>Se a contratação for cancelada antes da conclusão, a comissão é cancelada.</li>
            <li>Serviço “sob orçamento”, ainda sem valor definido, não gera comissão.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- componente -------------------------------- */

export function SimuladorDeComissoes({ niveis, protecaoDias }: { niveis: readonly NivelSimulavel[] | null; protecaoDias: number }) {
  const [aba, setAba] = useState<Aba>(niveis?.length ? 'recorrente' : 'avulso')
  const abas: { id: Aba; rotulo: string; Icone: typeof Repeat; disponivel: boolean }[] = [
    { id: 'recorrente', rotulo: 'Planos (recorrente)', Icone: Repeat, disponivel: !!niveis?.length },
    { id: 'avulso', rotulo: 'Serviços avulsos', Icone: Briefcase, disponivel: true },
  ]
  const idBase = useId()

  return (
    <div>
      <div role="tablist" aria-label="Tipo de comissão" className="mx-auto flex w-fit gap-1 rounded-full border border-border bg-card p-1">
        {abas.map(({ id, rotulo, Icone, disponivel }) => (
          <button
            key={id}
            role="tab"
            id={`${idBase}-${id}`}
            aria-selected={aba === id}
            aria-controls={`${idBase}-painel`}
            disabled={!disponivel}
            onClick={() => setAba(id)}
            className={cn(
              'alvo-toque-h inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              aba === id ? 'bg-gradient-gold text-on-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className="size-4" aria-hidden="true" /> {rotulo}
          </button>
        ))}
      </div>

      <div id={`${idBase}-painel`} role="tabpanel" aria-labelledby={`${idBase}-${aba}`} className="mt-6">
        {aba === 'recorrente' && niveis?.length ? <SimuladorRecorrente niveis={niveis} protecaoDias={protecaoDias} /> : <SimuladorAvulso />}
        {!niveis?.length && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4" aria-hidden="true" /> A simulação de planos volta assim que os níveis do programa forem publicados.
          </p>
        )}
      </div>

      <p className="mx-auto mt-6 flex max-w-3xl items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>
          <strong>Estimativa.</strong> Os valores servem para entender a regra, não são promessa de ganho. A comissão real
          depende de contratações efetivas, pagas e prestadas, conforme as regras do programa.
        </span>
      </p>
      <p className="sr-only">Os resultados são atualizados automaticamente ao alterar os campos.</p>
    </div>
  )
}
