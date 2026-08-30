'use client'

import Link from 'next/link'
import { CalendarClock, Megaphone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type GestaoInicioProps = {
  nome: string
  cadastrosPendentes: number
  /**
   * Configurações da plataforma, injetadas pela rota.
   *
   * Continua sendo um slot: quem monta o cartão é quem tem os dados no
   * servidor, e a tela inicial não precisa conhecer cada parâmetro novo.
   */
  configuracoes?: React.ReactNode
}

/**
 * Início da Gestão da plataforma, agora dentro do Admin.
 *
 * A tela perdeu o cabeçalho e o menu próprios que tinha em `/gestao`: barra
 * lateral, cabeçalho, tema e logout passaram a vir do `AdminShell`, o mesmo do
 * painel. O conteúdo — atalhos, cadastros pendentes e configurações — é o que
 * já existia, apenas apontando para os destinos incorporados em `/admin`.
 */
const ATALHOS = [
  {
    href: '/admin/usuarios',
    icon: Users,
    titulo: 'Usuários',
    descricao: 'Contas da plataforma e análise dos cadastros profissionais.',
  },
  {
    href: '/admin/comunicados',
    icon: Megaphone,
    titulo: 'Comunicados',
    descricao: 'Mural institucional que alimenta a Atividade Recente do painel.',
  },
  {
    href: '/admin/consultorias',
    icon: CalendarClock,
    titulo: 'Consultorias',
    descricao: 'Acompanhamento operacional das consultorias agendadas.',
  },
]

export function GestaoInicio({ nome, cadastrosPendentes, configuracoes }: GestaoInicioProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Gestão da plataforma
        </p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Olá, {nome}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Este é o ambiente reservado à gestão da Vincis, agora dentro da área
          administrativa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ATALHOS.map((atalho) => {
          const Icone = atalho.icon
          return (
            <Link key={atalho.href} href={atalho.href} className="group">
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/40">
                <CardContent className="p-5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icone className="size-5" />
                  </div>
                  <p className="mt-4 font-semibold">{atalho.titulo}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{atalho.descricao}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card>
        <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Cadastros pendentes</p>
            <p className="text-sm text-muted-foreground">
              {cadastrosPendentes}{' '}
              {cadastrosPendentes === 1
                ? 'profissional aguardando análise'
                : 'profissionais aguardando análise'}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/usuarios?statusProfissional=aguardando_analise">
              Analisar cadastros
            </Link>
          </Button>
        </CardContent>
      </Card>

      {configuracoes}
    </div>
  )
}

export default GestaoInicio
