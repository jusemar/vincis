'use client'

import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type CampoSenhaProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Campo de senha com alternância de visibilidade.
 *
 * Componente único reutilizável para não duplicar a lógica do "olho" em cada
 * formulário de autenticação. O input continua sendo um input nativo comum
 * (mesmas classes, mesmo ref, mesmo name), portanto validação HTML, react-hook-form
 * e o envio do formulário permanecem inalterados — só a apresentação muda.
 */
export const CampoSenha = forwardRef<HTMLInputElement, CampoSenhaProps>(
  function CampoSenha({ className, ...props }, ref) {
    const [visivel, setVisivel] = useState(false)
    const descricaoId = useId()

    return (
      <div className="relative">
        <input
          ref={ref}
          {...props}
          type={visivel ? 'text' : 'password'}
          // pr-11 reserva o espaço do botão para o texto nunca ficar sob o ícone.
          className={cn(className, 'pr-11')}
          aria-describedby={descricaoId}
        />
        <button
          type="button"
          onClick={() => setVisivel((atual) => !atual)}
          // aria-pressed comunica o estado do botão; o foco visível garante o uso por teclado.
          aria-pressed={visivel}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          {visivel ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <span id={descricaoId} className="sr-only">
          {visivel ? 'Senha visível.' : 'Senha oculta.'}
        </span>
      </div>
    )
  },
)
