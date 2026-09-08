'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LogOut, Menu, UserRound } from 'lucide-react'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { useAuth } from '@/features/usuarios'
import { cn } from '@/lib/utils'
import {
  rotuloDaSecao,
  secaoDaRota,
} from '@/features/parceiros/constants/navegacao'
import { AREAS_CLIENTE, ROTA_CLIENTE, areaDaRota } from '../../constants/navegacao'

/**
 * Onde a pessoa está, lido da rota.
 *
 * Dentro de Parceiros o cabeçalho mostra a seção aberta com o módulo por
 * contexto — o mesmo nível de detalhe que o menu lateral já indica.
 */
function ondeEstou(caminho: string): { titulo: string; contexto: string | null } {
  const secao = secaoDaRota(caminho)
  if (secao) return { titulo: rotuloDaSecao(secao), contexto: 'Parceiros' }

  const area = areaDaRota(caminho)
  return { titulo: area?.rotulo ?? AREAS_CLIENTE[0].rotulo, contexto: null }
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'US'
  return `${partes[0][0]}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}

/**
 * Cabeçalho da Área do Cliente. Um só, para todas as áreas.
 *
 * Segue o cabeçalho do painel administrativo — mesma altura (`h-16`), mesma
 * faixa (`border-b bg-card/95 backdrop-blur-md`), alternância de tema e menu da
 * conta com avatar, nome e seta. É a linguagem de produto já aprovada ali, e
 * repeti-la é o que faz as duas áreas parecerem o mesmo sistema.
 *
 * Duas diferenças, ambas deliberadas:
 *
 * - **sem busca e sem sino.** O painel tem os dois; aqui nenhum teria o que
 *   fazer — o Portal não indexa nada para buscar e não tem fila de avisos.
 *   Controle que não funciona mente sobre o que o sistema faz.
 * - **no lugar deles, onde a pessoa está.** A esquerda do cabeçalho traz o
 *   nome da página aberta, derivado da rota — não há propriedade a passar, e
 *   por isso não há como o cabeçalho discordar da URL.
 */
export function CabecalhoDoCliente({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const caminho = usePathname() ?? ROTA_CLIENTE
  const { titulo, contexto } = ondeEstou(caminho)
  const router = useRouter()
  const { usuario, logout } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  const nome = usuario?.nome ?? 'Minha conta'

  async function sair() {
    if (saindo) return
    setSaindo(true)
    setAberto(false)
    await logout()
    router.replace('/')
    router.refresh()
  }

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between gap-3 overflow-visible border-b bg-card/95 px-3 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="alvo-toque flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="min-w-0">
          {contexto ? (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {contexto}
            </p>
          ) : null}
          {/*
            Rótulo da moldura, não título do documento: o `h1` da página
            continua sendo o do conteúdo ("Bom te ver, Marina.", "Meu link"),
            que diz muito mais. Dois `h1` na mesma tela atrapalhariam quem
            navega por leitor de tela.
          */}
          <p
            className={cn(
              'truncate font-serif font-semibold leading-tight',
              contexto ? 'text-base' : 'text-lg',
            )}
          >
            {titulo}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />

        <div className="relative">
          <motion.button
            type="button"
            onClick={() => setAberto((valor) => !valor)}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent sm:px-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-haspopup="menu"
            aria-expanded={aberto}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-gold">
              <span className="text-sm font-bold text-on-gradient">
                {iniciais(nome)}
              </span>
            </span>
            <span className="hidden max-w-40 truncate text-left text-sm font-medium md:block">
              {nome}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </motion.button>

          <AnimatePresence>
            {aberto ? (
              <>
                <div
                  className="fixed inset-0 z-[90]"
                  onClick={() => setAberto(false)}
                />
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="fixed right-3 top-16 z-[100] w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border bg-card shadow-xl sm:absolute sm:right-0 sm:top-12 sm:w-56"
                >
                  <div className="border-b p-4">
                    <p className="truncate text-sm font-medium">{nome}</p>
                    {usuario?.email ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {usuario.email}
                      </p>
                    ) : null}
                  </div>
                  <div className="p-2">
                    <Link
                      href="/cliente/conta"
                      onClick={() => setAberto(false)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                    >
                      <UserRound className="size-4" aria-hidden />
                      Minha conta
                    </Link>
                    <button
                      type="button"
                      onClick={() => void sair()}
                      disabled={saindo}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <LogOut className="size-4" aria-hidden />
                      {saindo ? 'Saindo...' : 'Sair'}
                    </button>
                  </div>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
