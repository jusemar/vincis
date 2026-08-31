'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BadgeDollarSign,
  CalendarClock,
  LayoutDashboard,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { modulosDaCentral } from '../../constants/recursos'

/**
 * A moldura da Central Vincis.
 *
 * ## Um nível a mais, e não cinco itens a mais
 *
 * Os módulos da plataforma ocupavam cinco linhas na barra lateral de quem, no
 * dia a dia, opera o próprio escritório. Agora a barra carrega um item —
 * Central Vincis — e é aqui dentro que se escolhe o módulo. A hierarquia fica
 * legível: painel → Central → módulo.
 *
 * ## Por que uma barra horizontal, e não outra coluna
 *
 * Porque a Precificação já tem a própria coluna de navegação. Duas colunas de
 * menu lado a lado disputariam a mesma leitura e empurrariam o conteúdo para
 * uma faixa estreita. Horizontal aqui, vertical lá: cada nível tem uma forma
 * diferente, e a pessoa sabe em qual está sem precisar ler. A barra é rasa de
 * propósito — uma linha de itens sobre um filete —, para não competir com a
 * moldura da tela que ela abre.
 *
 * No celular a mesma barra rola na horizontal — os cinco módulos não cabem em
 * uma linha, e quebrar em duas empurraria o conteúdo para baixo da dobra.
 */
const ICONE_DO_MODULO: Record<string, LucideIcon> = {
  central: LayoutDashboard,
  usuarios: Users,
  comunicados: Megaphone,
  consultorias: CalendarClock,
  precificacao: BadgeDollarSign,
}

export function CentralVincisShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const modulos = modulosDaCentral()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <nav
        aria-label="Módulos da Central Vincis"
        className="-mx-1 overflow-x-auto border-b border-border/70 px-1 pb-2"
      >
        <div className="flex w-max items-center gap-1">
          {modulos.map((modulo) => {
            const Icone = ICONE_DO_MODULO[modulo.id] ?? LayoutDashboard
            // A Visão geral é a raiz da Central: só fica ativa na própria rota,
            // ou os cinco itens acenderiam juntos em qualquer módulo.
            const ativo =
              pathname === modulo.rota ||
              (modulo.id !== 'central' && pathname.startsWith(`${modulo.rota}/`))
            return (
              <Link
                key={modulo.id}
                href={modulo.rota}
                aria-current={ativo ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  ativo
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
              >
                <Icone className={`size-4 ${ativo ? 'text-primary' : ''}`} />
                {modulo.rotuloCurto}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="min-w-0">{children}</div>
    </div>
  )
}
