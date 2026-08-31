'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Award,
  Calendar,
  CalendarClock,
  DollarSign,
  Headphones,
  LayoutDashboard,
  Megaphone,
  Menu,
  Star,
  BadgeDollarSign,
  Landmark,
  Target,
  Ticket,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { recursosPermitidos } from '../constants/recursos'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

const PRINCIPAIS = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'appointments', label: 'Agenda', icon: Calendar },
  { id: 'profile', label: 'Perfil', icon: User },
] as const

// `Serviços` saiu do menu junto com a versão desktop: o catálogo vive em
// `Meu Perfil → Serviços` e o trabalho contratado, em `Atendimentos`.
const DEMAIS = [
  { id: 'team', label: 'Equipe', icon: UsersRound },
  { id: 'tickets', label: 'Mensagens', icon: Ticket },
  { id: 'atendimentos', label: 'Atendimentos', icon: Headphones },
  { id: 'oportunidades', label: 'Oportunidades', icon: Target },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'reviews', label: 'Avaliações', icon: Star },
  { id: 'achievements', label: 'Conquistas', icon: Award },
] as const

/**
 * Ícone de cada recurso administrativo que é rota própria.
 *
 * A lista e a regra de visibilidade vêm do mesmo registro que a barra lateral
 * consulta — é isso que impede o menu de divergir entre desktop e mobile.
 */
const ICONE_DO_RECURSO: Record<string, LucideIcon> = {
  central: Landmark,
  usuarios: Users,
  comunicados: Megaphone,
  consultorias: CalendarClock,
  precificacao: BadgeDollarSign,
}

function destino(id: string) {
  return id === 'dashboard' ? '/admin' : `/admin?pagina=${id}`
}

export function MobileAdminNavigation({
  ehGestor = false,
  ehPrestador = true,
}: {
  /**
   * A sessão é do Gestor da Plataforma — resolvido pelo `AdminShell` a partir
   * do perfil autenticado, o mesmo valor que a barra lateral recebe.
   */
  ehGestor?: boolean
  /** A conta exerce operação profissional. Ver `AdminSidebar`. */
  ehPrestador?: boolean
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const paginaAtual = searchParams.get('pagina') || 'dashboard'
  const [maisAberto, setMaisAberto] = useState(false)
  const paginaNoMais = DEMAIS.some(({ id }) => id === paginaAtual)

  // Os recursos da plataforma entram no mesmo lugar em que as demais áreas do
  // painel já moram: a gaveta "Mais". A barra inferior tem cinco colunas e é
  // a navegação do dia a dia — empurrar cinco itens de administração para
  // dentro dela trocaria o menu do painel pelo da Gestão, que é justamente o
  // que não se quer.
  const recursos = ehGestor ? recursosPermitidos({ ehGestor }) : []

  // Sem operação profissional, a barra do painel levaria a telas vazias: a
  // navegação vira a da Gestão da Plataforma, com o Início ao lado.
  if (!ehPrestador && recursos.length > 0) {
    return (
      <nav
        aria-label="Navegação da Gestão"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-lg lg:hidden"
      >
        <div
          className="mx-auto grid max-w-lg gap-1"
          style={{
            gridTemplateColumns: `repeat(${recursos.length + 1}, minmax(0, 1fr))`,
          }}
        >
          <Link
            href="/admin"
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
              pathname === '/admin'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <LayoutDashboard className="size-5" />
            <span className="truncate">Início</span>
          </Link>
          {recursos.map((recurso) => {
            const Icone = ICONE_DO_RECURSO[recurso.id] ?? LayoutDashboard
            const ativo =
              pathname === recurso.rota ||
              pathname.startsWith(`${recurso.rota}/`)
            return (
              <Link
                key={recurso.id}
                href={recurso.rota}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
                  ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icone className="size-5" />
                <span className="truncate">{recurso.rotulo}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {PRINCIPAIS.map((item) => {
            const Icone = item.icon
            const ativo = paginaAtual === item.id
            return (
              <Link
                key={item.id}
                href={destino(item.id)}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
                  ativo
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Icone className="size-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
              paginaNoMais
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <Menu className="size-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Drawer open={maisAberto} onOpenChange={setMaisAberto}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Mais opções</DrawerTitle>
            <DrawerDescription>
              Acesse as demais áreas do seu painel.
            </DrawerDescription>
          </DrawerHeader>
          <nav className="grid grid-cols-2 gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {DEMAIS.map((item) => {
              const Icone = item.icon
              return (
                <Link
                  key={item.id}
                  href={destino(item.id)}
                  onClick={() => setMaisAberto(false)}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Icone className="size-5 text-primary" />
                  {item.label}
                </Link>
              )
            })}

            {recursos.length > 0 ? (
              <>
                {recursos.map((recurso) => {
                  const Icone = ICONE_DO_RECURSO[recurso.id] ?? LayoutDashboard
                  const ativo =
                    pathname === recurso.rota ||
                    pathname.startsWith(`${recurso.rota}/`)
                  return (
                    <Link
                      key={recurso.id}
                      href={recurso.rota}
                      onClick={() => setMaisAberto(false)}
                      className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-medium transition-colors hover:bg-accent ${
                        ativo ? 'border-primary bg-primary/10' : 'bg-card'
                      }`}
                    >
                      <Icone className="size-5 text-primary" />
                      {recurso.rotulo}
                    </Link>
                  )
                })}
              </>
            ) : null}
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  )
}
