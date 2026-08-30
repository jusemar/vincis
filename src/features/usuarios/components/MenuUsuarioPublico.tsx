'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LayoutDashboard, LogOut, User } from 'lucide-react'
import { ehGestorPlataforma } from '../lib/gestor-plataforma'
import { useAuth } from '../hooks/useAuth'
import { tipoPrestadorDoPerfil } from '../lib/tipos-pessoa'
import type { PerfilTipo } from '../types'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return 'US'
  return `${partes[0][0]}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}

/**
 * Para onde cada perfil vai a partir do site público.
 *
 * O Cliente tem "Área do Cliente"; prestador e Gestor mantêm os nomes das
 * próprias áreas. Nenhum destes links autoriza coisa alguma — o middleware
 * continua resolvendo o destino real de cada conta, e um prestador com cadastro
 * pendente que clicar em "Meu painel" é levado ao cadastro, como sempre foi.
 */
function areasDoPerfil(perfil: PerfilTipo) {
  if (ehGestorPlataforma(perfil)) {
    return {
      painel: { rotulo: 'Gestão Vincis', href: '/admin' },
      conta: { rotulo: 'Minha conta', href: '/admin' },
    }
  }
  if (tipoPrestadorDoPerfil(perfil)) {
    return {
      painel: { rotulo: 'Meu painel', href: '/admin' },
      conta: { rotulo: 'Minha conta', href: '/admin?pagina=profile' },
    }
  }
  return {
    painel: { rotulo: 'Área do Cliente', href: '/cliente' },
    conta: { rotulo: 'Minha conta', href: '/cliente?aba=conta' },
  }
}

/**
 * Estado logado no cabeçalho público.
 *
 * Existe porque estar autenticado não pode significar estar preso ao painel: o
 * Cliente precisa continuar percorrendo `/profissionais`, perfis e o resto do
 * site — é lá que ele descobre com quem falar. Antes, o cabeçalho público
 * oferecia "Entrar / Criar conta" mesmo a quem já estava dentro, e a única
 * saída visível era voltar para `/cliente`.
 *
 * Não há autenticação nova aqui: o menu apenas usa a sessão e o `logout` que já
 * existem.
 */
export function MenuUsuarioPublico({
  variant = 'desktop',
  aoNavegar,
}: {
  variant?: 'desktop' | 'mobile'
  aoNavegar?: () => void
}) {
  const router = useRouter()
  const { usuario, logout } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  if (!usuario) return null

  const areas = areasDoPerfil(usuario.perfilTipo)

  async function sair() {
    if (saindo) return
    setSaindo(true)
    setAberto(false)
    aoNavegar?.()
    await logout()
    router.refresh()
    setSaindo(false)
  }

  if (variant === 'mobile') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={areas.painel.href}
          onClick={aoNavegar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/50"
        >
          <LayoutDashboard className="h-5 w-5" />
          {areas.painel.rotulo}
        </Link>
        <Link
          href={areas.conta.href}
          onClick={aoNavegar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition-all hover:bg-muted/50"
        >
          <User className="h-5 w-5" />
          {areas.conta.rotulo}
        </Link>
        <button
          onClick={() => void sair()}
          disabled={saindo}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold text-destructive transition-all hover:bg-muted/50 disabled:opacity-60"
        >
          <LogOut className="h-5 w-5" />
          {saindo ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        // No desktop estreito o botão mostra só as iniciais; sem o rótulo ele
        // ficaria sem nome acessível para leitor de tela.
        aria-label="Abrir menu da conta"
        aria-expanded={aberto}
        className="glass flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2 text-sm font-medium text-foreground/80 transition-all hover:border-primary/40 hover:text-primary"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-gradient-gold text-xs font-bold text-on-gradient">
          {iniciais(usuario.nome)}
        </span>
        <span className="hidden max-w-32 truncate lg:inline">
          {usuario.nome.split(/\s+/)[0]}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {aberto && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setAberto(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border bg-card shadow-xl"
            >
              <div className="border-b p-4">
                <p className="truncate text-sm font-medium">{usuario.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {usuario.email}
                </p>
              </div>
              <div className="p-2">
                <Link
                  href={areas.painel.href}
                  onClick={() => setAberto(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {areas.painel.rotulo}
                </Link>
                <Link
                  href={areas.conta.href}
                  onClick={() => setAberto(false)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <User className="h-4 w-4" />
                  {areas.conta.rotulo}
                </Link>
                <button
                  type="button"
                  onClick={() => void sair()}
                  disabled={saindo}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4" />
                  {saindo ? 'Saindo...' : 'Sair'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
