'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import Footer from './Footer'
import NavigationNext from './NavigationNext'
import type { GrupoNavegacaoPublico } from '@/features/cms/nucleo/lib/navegacao'
import type { GrupoMenuPublico } from '@/features/cms/nucleo/lib/arvore-navegacao'

type AppChromeProps = {
  children: React.ReactNode
  /** Colunas do rodapé vindas do CMS, lidas no servidor pelo layout raiz. */
  navegacaoRodape?: GrupoNavegacaoPublico[]
  /** Menu do cabeçalho vindo do CMS (grupos em sequência, já em árvore). */
  navegacaoCabecalho?: GrupoMenuPublico[]
}

export function AppChrome({
  children,
  navegacaoRodape = [],
  navegacaoCabecalho = [],
}: AppChromeProps) {
  const pathname = usePathname()
  // Áreas autenticadas têm cabeçalho próprio: a navegação pública do site não
  // deve aparecer sobre elas. `/cliente` entra aqui pelo mesmo motivo que
  // `/admin` — é uma área logada, com header e logout próprios. A antiga
  // `/gestao` saiu da lista: virou parte de `/admin`.
  const AREAS_AUTENTICADAS = [
    '/admin',
    '/cliente',
    '/profissional',
    '/cadastro-profissional',
    '/cadastro-colaborador',
  ]
  // Comparação por segmento: `startsWith('/profissional')` também casava com
  // a vitrine pública `/profissionais`, que perdia navegação e footer globais.
  const estaNaAreaAdministrativa = AREAS_AUTENTICADAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  )

  return (
    <>
      {/*
        A navegação lê a query (`?entrar=1` abre o login em qualquer página
        pública). Ler search params exige limite de Suspense para que as
        páginas públicas continuem sendo geradas estaticamente — o fallback é
        nulo porque o cabeçalho aparece no mesmo quadro em que hidrata.
      */}
      {!estaNaAreaAdministrativa && (
        <Suspense fallback={null}>
          <NavigationNext menuCms={navegacaoCabecalho.flatMap((grupo) => grupo.itens)} />
        </Suspense>
      )}
      <main className="min-h-dvh bg-background">{children}</main>
      {!estaNaAreaAdministrativa && <Footer gruposCms={navegacaoRodape} />}
    </>
  )
}
