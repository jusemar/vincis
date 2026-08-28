'use client'

import { AlertCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTULO_PAGAMENTO_SIMULADO } from '@/features/pagamentos/constants/pagamento'
import { formatarRestante } from '../../lib/reserva'

/**
 * A etapa 2 do modal: a simulação de pagamento.
 *
 * ## Ela se anuncia
 *
 * O painel diz `Simulação de pagamento` — o mesmo rótulo que a tela do acordo já
 * usa — e repete em texto que nada será cobrado. Não é uma tela de pagamento
 * com os campos desabilitados: **não existem** campos de cartão, CVV, titular
 * ou chave PIX, porque a plataforma não coleta nenhum deles nesta etapa.
 *
 * ## Por que existe um botão de recusar
 *
 * Porque um simulador que só aprova não deixa ninguém exercitar o caminho da
 * recusa — nem quem testa à mão, nem a suíte. Pedir a recusa não é um poder: a
 * aprovação já é o padrão, então o único efeito do botão é falhar de propósito.
 * O servidor continua sendo quem decide, e uma recusa não confirma nada, não
 * abre protocolo e não devolve tempo à reserva.
 *
 * ## O contador
 *
 * Desenha `expira_em`, e nada mais. Quem recusa uma reserva vencida é o
 * servidor, na hora de processar — o número na tela nunca autoriza nem impede.
 */

export type PainelPagamentoSimuladoProps = {
  valorFormatado: string
  segundosRestantes: number
  processando: boolean
  erro: string | null
  /** Só a recusa mora aqui: a ação principal fica na barra inferior do modal. */
  onRecusar: () => void
}

export function PainelPagamentoSimulado({
  valorFormatado,
  segundosRestantes,
  processando,
  erro,
  onRecusar,
}: PainelPagamentoSimuladoProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {ROTULO_PAGAMENTO_SIMULADO}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Nenhuma cobrança será feita e nenhum dado de cartão é pedido. Esta
              etapa existe para fechar o fluxo enquanto o pagamento real não
              está conectado.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm font-medium text-muted-foreground">
            Total a pagar
          </span>
          <span className="text-xl font-bold text-foreground">{valorFormatado}</span>
        </div>
      </div>

      <p className="flex items-baseline justify-center gap-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">
          Reserva expira em
        </span>
        <span
          className={cn(
            'font-semibold tabular-nums text-foreground',
            segundosRestantes <= 60 && 'text-destructive',
          )}
          aria-hidden
        >
          {formatarRestante(segundosRestantes)}
        </span>
        <span className="sr-only" aria-live="polite">
          {Math.ceil(segundosRestantes / 60)} minutos restantes
        </span>
      </p>

      {erro ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">{erro}</p>
            <p className="text-xs text-muted-foreground">
              Sua reserva continua válida pelo tempo restante — você pode tentar
              de novo.
            </p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onRecusar}
        disabled={processando}
        className="mx-auto block rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        Simular pagamento recusado
      </button>
    </div>
  )
}
