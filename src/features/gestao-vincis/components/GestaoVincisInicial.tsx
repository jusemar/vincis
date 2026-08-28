'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, CalendarClock, ChevronDown, LogOut, Megaphone, ShieldCheck, Users } from 'lucide-react'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/usuarios'

type GestaoVincisInicialProps = {
  nome: string
  cadastrosPendentes: number
  /**
   * Configurações da plataforma, injetadas pela rota.
   *
   * Entra como slot para que a tela inicial aprovada não precise conhecer cada
   * parâmetro novo — quem monta o cartão é quem tem os dados no servidor.
   */
  configuracoes?: React.ReactNode
}

function obterIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return `${partes[0]?.[0] ?? 'G'}${partes.at(-1)?.[0] ?? ''}`.toUpperCase()
}

export function GestaoVincisInicial({ nome, cadastrosPendentes, configuracoes }: GestaoVincisInicialProps) {
  const router = useRouter()
  const { logout } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    if (saindo) return
    setSaindo(true)
    await logout()
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_34%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.35))]">
      <header className="border-b border-border/70 bg-card/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="font-serif text-lg font-semibold leading-none">Gestão da Vincis</p>
              <p className="mt-1 text-xs text-muted-foreground">Ambiente interno protegido</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuAberto((aberto) => !aberto)}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-accent"
                aria-expanded={menuAberto}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {obterIniciais(nome)}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{nome}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {menuAberto && (
                <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border bg-card p-2 shadow-xl">
                  <div className="border-b px-3 py-2">
                    <p className="truncate text-sm font-medium">{nome}</p>
                    <p className="text-xs text-muted-foreground">Gestor da Vincis</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void sair()}
                    disabled={saindo}
                    className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-accent disabled:opacity-60"
                  >
                    <LogOut className="size-4" />
                    {saindo ? 'Saindo...' : 'Sair'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 sm:py-24">
        <Card className="w-full max-w-2xl border-border/70 bg-card/90 shadow-[var(--shadow-card)] backdrop-blur">
          <CardContent className="p-7 sm:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Acesso interno
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Gestão da Vincis
            </h1>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              Olá, {nome}. Este é o ambiente reservado para a gestão da plataforma. Os módulos
              operacionais serão disponibilizados nas próximas etapas.
            </p>
            <Button variant="outline" className="mt-8" onClick={() => void sair()} disabled={saindo}>
              <LogOut className="size-4" />
              {saindo ? 'Encerrando sessão...' : 'Sair da gestão'}
            </Button>
            <Button asChild className="mt-8 ml-3">
              <Link href="/gestao/usuarios">
                <Users className="size-4" />
                Usuários
              </Link>
            </Button>
            {/* Mural institucional: é daqui que sai o que aparece em
                "Atividade Recente" no Dashboard de quem usa a plataforma. */}
            <Button asChild variant="outline" className="mt-8 ml-3">
              <Link href="/gestao/comunicados">
                <Megaphone className="size-4" />
                Comunicados
              </Link>
            </Button>
            {/* Acompanhamento operacional das Consultorias Agendadas: leitura,
                nunca intervenção — cancelar e remarcar seguem com as partes. */}
            <Button asChild variant="outline" className="mt-8 ml-3">
              <Link href="/gestao/consultorias">
                <CalendarClock className="size-4" />
                Consultorias
              </Link>
            </Button>
            <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border bg-background/70 p-4">
              <div><p className="text-sm font-semibold">Cadastros pendentes</p><p className="text-sm text-muted-foreground">{cadastrosPendentes} {cadastrosPendentes === 1 ? 'profissional aguardando análise' : 'profissionais aguardando análise'}</p></div>
              <Button asChild size="sm" variant="outline"><Link href="/gestao/usuarios?statusProfissional=aguardando_analise">Analisar cadastros</Link></Button>
            </div>
          </CardContent>
        </Card>
        {configuracoes}
      </main>
    </div>
  )
}
