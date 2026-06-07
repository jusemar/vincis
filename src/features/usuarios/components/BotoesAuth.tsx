import { LogIn, UserPlus } from 'lucide-react'

interface BotoesAuthProps {
  variant?: 'desktop' | 'mobile'
  onAbrirEntrar: () => void
  onAbrirCadastro: () => void
}

export function BotoesAuth({ variant = 'desktop', onAbrirEntrar, onAbrirCadastro }: BotoesAuthProps) {
  if (variant === 'mobile') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('[BotoesAuth] mobile Entrar clicked')
            onAbrirEntrar()
          }}
          className="w-full px-5 py-3 text-sm font-semibold text-foreground border border-border rounded-xl flex items-center justify-center gap-2 hover:bg-muted/50 transition-all"
        >
          <LogIn className="w-5 h-5" />
          Entrar
        </button>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('[BotoesAuth] mobile Criar conta clicked')
            onAbrirCadastro()
          }}
          className="w-full px-5 py-3 text-sm font-semibold text-primary-foreground bg-gradient-gold rounded-xl flex items-center justify-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Criar Conta
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          console.log('[BotoesAuth] desktop Entrar clicked')
          onAbrirEntrar()
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition-all text-sm font-medium glass"
      >
        <LogIn className="h-4 w-4" />
        Entrar
      </button>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          console.log('[BotoesAuth] desktop Criar conta clicked')
          onAbrirCadastro()
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/40 text-foreground/80 hover:text-primary hover:border-primary/40 transition-all text-sm font-medium glass"
      >
        <UserPlus className="h-4 w-4" />
        <span className="hidden sm:inline">Criar conta</span>
      </button>
    </>
  )
}
