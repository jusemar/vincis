'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Award,
  Calendar,
  DollarSign,
  Headphones,
  LayoutDashboard,
  Menu,
  Star,
  Ticket,
  User,
  Users,
  UsersRound,
} from 'lucide-react'
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
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'reviews', label: 'Avaliações', icon: Star },
  { id: 'achievements', label: 'Conquistas', icon: Award },
] as const

function destino(id: string) {
  return id === 'dashboard' ? '/admin' : `/admin?pagina=${id}`
}

export function MobileAdminNavigation() {
  const searchParams = useSearchParams()
  const paginaAtual = searchParams.get('pagina') || 'dashboard'
  const [maisAberto, setMaisAberto] = useState(false)
  const paginaNoMais = DEMAIS.some(({ id }) => id === paginaAtual)

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
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  )
}
