'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'
import NavigationNext from './NavigationNext'

type AppChromeProps = {
  children: React.ReactNode
}

export function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname()
  // Áreas autenticadas têm cabeçalho próprio: a navegação pública do site não
  // deve aparecer sobre elas. `/cliente` entra aqui pelo mesmo motivo que
  // `/admin` e `/gestao` — é uma área logada, com header e logout próprios.
  const AREAS_AUTENTICADAS = [
    '/admin',
    '/gestao',
    '/cliente',
    '/profissional',
    '/cadastro-profissional',
    '/cadastro-colaborador',
  ]
  const estaNaAreaAdministrativa = AREAS_AUTENTICADAS.some((rota) =>
    pathname.startsWith(rota),
  )

  return (
    <>
      {!estaNaAreaAdministrativa && <NavigationNext />}
      <main className="min-h-screen bg-background">{children}</main>
      {!estaNaAreaAdministrativa && <Footer />}
    </>
  )
}
