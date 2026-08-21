'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, UserRound } from 'lucide-react'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/usuarios'

/**
 * Cabeçalho da Área do Cliente.
 *
 * Preservado da Vincis, não substituído pelo shell da referência: marca, e-mail
 * da conta, alternância de tema (Sol/Lua) e saída continuam exatamente onde
 * estavam e continuam funcionando igual. O que mudou é o acabamento — hairline
 * no lugar da borda pesada e a navegação passando a viver logo abaixo.
 *
 * Só esta faixa é componente de cliente, porque sair da conta e trocar o tema
 * são interações. O conteúdo das quatro áreas é renderizado no servidor.
 */
export function CabecalhoDoPortal({ email }: { email: string }) {
  const router = useRouter()
  const { logout } = useAuth()
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    if (saindo) return
    setSaindo(true)
    await logout()
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="flex h-16 items-center justify-between gap-3">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <UserRound className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-serif text-lg font-semibold leading-none">
            Minha área
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <Button
          variant="outline"
          size="sm"
          onClick={sair}
          disabled={saindo}
          aria-label={saindo ? 'Saindo da conta' : 'Sair da conta'}
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">{saindo ? 'Saindo...' : 'Sair'}</span>
        </Button>
      </div>
    </div>
  )
}
