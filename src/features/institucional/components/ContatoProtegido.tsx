'use client'

import { useSyncExternalStore } from 'react'
import { Mail, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  linkEmailVincis,
  linkWhatsappVincis,
  montarEmailVincis,
  montarWhatsappVincisExibicao,
} from '../constants/contatos'

/**
 * Um canal de contato da Vincis, protegido contra coleta simples.
 *
 * - O HTML que o servidor entrega traz só o rótulo do canal ("E-mail",
 *   "WhatsApp"); o endereço é montado no navegador, depois da hidratação.
 * - Não existe `href` com `mailto:`/`wa.me` no documento: é um `<button>`, e o
 *   link é montado e aberto no clique. Botão nativo = foco por teclado, Enter e
 *   Espaço, leitor de tela e toque funcionam sem nada a mais.
 * - Sem JavaScript, o `<noscript>` mostra o canal escrito por extenso de um jeito
 *   que robôs simples não reconhecem como e-mail.
 */

type Canal = 'email' | 'whatsapp'

/** Nada a observar: o valor só muda de "servidor" para "navegador", uma vez. */
const semAssinatura = () => () => {}

const ROTULO: Record<Canal, string> = { email: 'E-mail', whatsapp: 'WhatsApp' }
const ICONE = { email: Mail, whatsapp: MessageCircle } as const
const SEM_JAVASCRIPT: Record<Canal, string> = {
  email: 'contato [arroba] vincis [ponto] com [ponto] br',
  whatsapp: '31 9 9252 5777',
}

export function ContatoProtegido({
  canal,
  variante = 'rodape',
  className,
}: {
  canal: Canal
  /** `rodape`: linha compacta com ícone. `cartao`: bloco maior, da página Contato. */
  variante?: 'rodape' | 'cartao'
  className?: string
}) {
  // `false` no servidor (e na hidratação), `true` depois, no navegador: o HTML
  // entregue pelo servidor nunca carrega o endereço montado.
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false)
  const valor = noNavegador ? (canal === 'email' ? montarEmailVincis() : montarWhatsappVincisExibicao()) : null

  const abrir = () => {
    if (canal === 'email') {
      window.location.href = linkEmailVincis()
    } else {
      window.open(linkWhatsappVincis(), '_blank', 'noopener,noreferrer')
    }
  }

  const Icone = ICONE[canal]
  const descricao =
    canal === 'email'
      ? `Enviar e-mail para a Vincis${valor ? ` (${valor})` : ''}`
      : `Abrir conversa com a Vincis no WhatsApp${valor ? ` (${valor})` : ''}`

  if (variante === 'cartao') {
    return (
      <div className={cn('rounded-2xl border border-border bg-card p-5 sm:p-6', className)}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{ROTULO[canal]}</h2>
        </div>
        <p className="mt-3 min-h-7 break-all text-base text-foreground/90 sm:text-lg" aria-live="polite">
          {valor ?? <span className="text-muted-foreground">Carregando…</span>}
        </p>
        <noscript>
          <p className="mt-3 text-base text-foreground/90">{SEM_JAVASCRIPT[canal]}</p>
        </noscript>
        <button
          type="button"
          onClick={abrir}
          disabled={!valor}
          aria-label={descricao}
          className="alvo-toque mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-gold px-5 py-3 text-sm font-semibold text-on-gradient shadow-glow transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 sm:w-auto"
        >
          <Icone className="size-4" aria-hidden="true" />
          {canal === 'email' ? 'Enviar e-mail' : 'Abrir conversa no WhatsApp'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={descricao}
        className={cn(
          'alvo-toque-h group flex items-center gap-3 rounded-lg text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/20">
          <Icone className="size-4" aria-hidden="true" />
        </span>
        <span className="break-all">{valor ?? ROTULO[canal]}</span>
      </button>
      <noscript>
        <span className="block pl-11 text-sm text-muted-foreground">{SEM_JAVASCRIPT[canal]}</span>
      </noscript>
    </>
  )
}
