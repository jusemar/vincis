'use client'

import { RefreshCw } from 'lucide-react'

/**
 * A espera do painel, com um desenho só.
 *
 * A moldura do `/admin` e o provedor de contexto de empresa mostravam telas
 * diferentes para o mesmo instante — uma tela em branco e um cartão girando.
 * Em branco não é um estado: quem via não sabia se a página estava chegando ou
 * se tinha quebrado. Agora as duas usam isto.
 */
export function TelaCarregandoEspaco({
  mensagem = 'Preparando seu espaço de trabalho...',
}: {
  mensagem?: string
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <RefreshCw className="size-5 animate-spin" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{mensagem}</p>
      </div>
    </div>
  )
}
