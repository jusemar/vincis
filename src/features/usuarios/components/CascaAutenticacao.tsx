import type { ReactNode } from 'react'

/**
 * Fundo e enquadramento das telas de conta (redefinir senha, confirmar e-mail).
 *
 * As duas páginas repetiam o mesmo invólucro, e o conteúdo nascia colado no
 * alto com a metade de baixo vazia. Aqui ele fica num lugar só:
 *
 * - **Desktop/tablet (`sm`+)**: coluna flexível com `justify-center` dentro de
 *   `min-h-dvh` — o cartão fica no meio do espaço entre o menu fixo (o `pt`
 *   reserva a altura dele) e a base. Conteúdo maior que a tela simplesmente
 *   empurra a altura: nada é cortado, a página rola.
 * - **Celular**: fluxo normal a partir do topo. Centralizar ali faria o campo
 *   pular quando o teclado virtual abre e encolhe a viewport.
 */
export function CascaAutenticacao({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background px-4 pb-16 pt-28 sm:flex sm:flex-col sm:justify-center sm:px-6 sm:pt-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-96 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border)/0.4)_1px,transparent_0)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>
      {children}
    </div>
  )
}
