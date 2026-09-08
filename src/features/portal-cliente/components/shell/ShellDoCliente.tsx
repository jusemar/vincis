'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { CabecalhoDoCliente } from './CabecalhoDoCliente'
import { MenuLateralCliente } from './MenuLateralCliente'
import { NavegacaoMobileCliente } from './NavegacaoMobileCliente'
import { useMenuRecolhido } from './menu-recolhido'
import { ROTA_CLIENTE, ehRotaDeParceiros } from '../../constants/navegacao'

/**
 * Moldura única da Área do Cliente.
 *
 * Cabeçalho, menu lateral, largura e comportamento responsivo são os mesmos em
 * **todas** as áreas — Visão geral, Orçamentos, Atendimentos, Parceiros e Minha
 * conta. O que muda de uma para a outra é só o conteúdo. Antes Parceiros tinha
 * moldura própria, e trocar de aba parecia trocar de sistema.
 *
 * A estrutura repete a do painel administrativo: barra lateral à esquerda,
 * cabeçalho de produto em cima, `h-dvh` com a rolagem dentro do `<main>` (sem
 * isso a barra fixa e o conteúdo longo brigariam pela mesma rolagem) e, no
 * celular, barra inferior com gaveta.
 *
 * ## Quem decide o que está ativo
 *
 * A URL. O layout envolve todas as páginas de `/cliente` e não recebe qual
 * delas está aberta — no App Router essa informação chega pelo caminho, e é
 * dele que o menu e o cabeçalho tiram o item aceso e o título. Passar isso como
 * propriedade obrigaria cada página a repetir o que a rota já diz.
 *
 * ## Estado do menu
 *
 * Recolher é **clique**, nunca hover, e o estado sobrevive à navegação: fica
 * guardado no navegador de quem usa, por `useMenuRecolhido`.
 */
export function ShellDoCliente({ children }: { children: React.ReactNode }) {
  const caminho = usePathname() ?? ROTA_CLIENTE
  const emParceiros = ehRotaDeParceiros(caminho)

  const [recolhida, alternarRecolhida] = useMenuRecolhido()
  // Entrar numa rota de Parceiros abre o grupo; fora dele o estado é de quem
  // usa, e sobrevive à navegação porque o shell não desmonta entre páginas.
  const [submenuAberto, setSubmenuAberto] = useState(emParceiros)
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const [menuMobileAberto, setMenuMobileAberto] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden lg:contents">
        <MenuLateralCliente
          recolhida={recolhida}
          submenuAberto={submenuAberto}
          onAlternarRecolhida={alternarRecolhida}
          onAlternarSubmenu={() => setSubmenuAberto((aberto) => !aberto)}
        />
      </div>

      {/* Abaixo de `lg` a mesma barra vira gaveta sobreposta. */}
      <AnimatePresence>
        {menuMobileAberto ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuMobileAberto(false)}
              className="fixed inset-0 z-[190] bg-foreground/40 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="lg:hidden"
            >
              <MenuLateralCliente
                recolhida={false}
                submenuAberto={submenuAberto}
                onAlternarRecolhida={alternarRecolhida}
                onAlternarSubmenu={() => setSubmenuAberto((aberto) => !aberto)}
                onNavegar={() => setMenuMobileAberto(false)}
                emGaveta
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CabecalhoDoCliente onAbrirMenu={() => setMenuMobileAberto(true)} />

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <NavegacaoMobileCliente
        gavetaAberta={gavetaAberta}
        onGaveta={setGavetaAberta}
      />
    </div>
  )
}
