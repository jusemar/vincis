'use client'

import { useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, QrCode, TimerReset } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTULO_STATUS_COBRANCA } from '../constants/cobranca'
import { useRelogio } from '../hooks/useAcompanharCobranca'
import type { CobrancaPixDTO } from '../types/cobranca'

function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function restante(expiraEm: Date | null, agora: number) {
  if (!expiraEm) return null
  const segundos = Math.max(0, Math.ceil((new Date(expiraEm).getTime() - agora) / 1000))
  const minutos = Math.floor(segundos / 60)
  return {
    segundos,
    texto: `${String(minutos).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`,
  }
}

/**
 * A etapa "Pagamento" de qualquer contratação: serviço, consultoria, acordo,
 * plano.
 *
 * Mostra o que a Efí emitiu — valor, QR Code, Pix Copia e Cola, validade — e a
 * situação **que o servidor informou**. Não tem botão "já paguei": a tela não
 * tem como saber, e fingir que tem levaria alguém a achar que pagou. A
 * confirmação aparece sozinha quando a Efí confirma.
 */
export function PainelPix({
  cobranca,
  gerando = false,
  erro = null,
  onGerarNovamente,
}: {
  cobranca: CobrancaPixDTO | null
  gerando?: boolean
  erro?: string | null
  /** Oferecido só onde gerar outro Pix faz sentido (não na consultoria). */
  onGerarNovamente?: () => void
}) {
  const aguardando = cobranca?.status === 'aguardando_pagamento'
  const agora = useRelogio(aguardando)
  const validade = aguardando ? restante(cobranca.expiraEm, agora) : null
  const venceuNaTela = aguardando && validade?.segundos === 0
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!cobranca?.pixCopiaECola) return
    try {
      await navigator.clipboard.writeText(cobranca.pixCopiaECola)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sem permissão de área de transferência: o campo continua selecionável.
      setCopiado(false)
    }
  }

  if (gerando || (!cobranca && !erro)) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Gerando o Pix…
      </div>
    )
  }

  if (!cobranca) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">{erro}</p>
          {onGerarNovamente ? (
            <button type="button" onClick={onGerarNovamente} className="text-xs font-semibold text-foreground underline underline-offset-2">
              Tentar novamente
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const encerrada = cobranca.status === 'expirada' || cobranca.status === 'cancelada' || venceuNaTela

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <QrCode className="size-4 text-primary" aria-hidden />
            Pagamento via Pix
          </p>
          <span
            role="status"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
              cobranca.status === 'paga' && 'bg-success/15 text-success',
              aguardando && !venceuNaTela && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
              (encerrada || cobranca.status === 'falhou') && 'bg-destructive/10 text-destructive',
            )}
          >
            {aguardando && !venceuNaTela ? (
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
            ) : null}
            {venceuNaTela ? ROTULO_STATUS_COBRANCA.expirada : ROTULO_STATUS_COBRANCA[cobranca.status]}
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
          <span className="text-xl font-bold text-foreground">{reais(cobranca.valorCentavos)}</span>
        </div>
      </div>

      {aguardando && !venceuNaTela ? (
        <>
          {cobranca.qrCodeImagem ? (
            <div className="flex justify-center">
              {/* Data URL devolvida pela Efí: `next/image` não otimiza nada aqui. */}
              <img
                src={cobranca.qrCodeImagem}
                alt="QR Code do Pix"
                className="size-52 rounded-xl border border-border bg-white p-2"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor={`pix-${cobranca.id}`} className="text-xs font-semibold text-muted-foreground">
              Pix Copia e Cola
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={`pix-${cobranca.id}`}
                readOnly
                value={cobranca.pixCopiaECola ?? ''}
                onFocus={(evento) => evento.currentTarget.select()}
                className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground"
              />
              <button
                type="button"
                onClick={copiar}
                className="alvo-toque-h inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95"
              >
                {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copiado ? 'Copiado' : 'Copiar código'}
              </button>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Abra o app do seu banco, escolha <strong>Pix</strong> e leia o QR Code ou cole o código.
            A confirmação aparece aqui automaticamente — não é preciso atualizar a página.
          </p>

          {validade ? (
            <p className="flex items-baseline justify-center gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Pix expira em</span>
              <span
                className={cn('font-semibold tabular-nums text-foreground', validade.segundos <= 60 && 'text-destructive')}
                aria-hidden
              >
                {validade.texto}
              </span>
              <span className="sr-only">{Math.ceil(validade.segundos / 60)} minutos restantes</span>
            </p>
          ) : null}
        </>
      ) : null}

      {cobranca.status === 'paga' ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-3">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-sm font-semibold text-foreground">Pagamento confirmado pela instituição financeira.</p>
        </div>
      ) : null}

      {encerrada ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <TimerReset aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-destructive">
              {cobranca.status === 'cancelada' ? 'Esta cobrança foi cancelada.' : 'O prazo deste Pix terminou.'}
            </p>
            <p className="text-xs text-muted-foreground">
              Se você já pagou, aguarde: a confirmação ainda pode chegar. Nada é cobrado em dobro.
            </p>
            {onGerarNovamente ? (
              <button type="button" onClick={onGerarNovamente} className="text-xs font-semibold text-foreground underline underline-offset-2">
                Gerar novo Pix
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>
      ) : null}
    </div>
  )
}
