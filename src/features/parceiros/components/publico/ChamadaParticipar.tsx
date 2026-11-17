import Link from 'next/link'
import { ArrowRight, Info, LayoutDashboard, LogIn, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SituacaoNaPaginaPublica } from '../../queries/situacao-publica'

/**
 * O botão "participar", levando ao fluxo real conforme quem está vendo.
 *
 * Antes, "Quero ser parceiro" e "Quero me cadastrar agora" rolavam a página até
 * o simulador. Agora:
 * - visitante → login/cadastro (`?entrar=1` abre o modal, que tem "Criar conta");
 * - conta que pode ativar → `/cliente/parceiros`, onde está "Ativar meu link";
 * - parceiro ativo → o mesmo endereço, que já abre o painel;
 * - conta sem área do cliente → explicação e contato, sem porta fechada.
 */

const DESTINO: Record<Exclude<SituacaoNaPaginaPublica, 'sem_area_cliente'>, { href: string; texto: string; ajuda: string; Icone: typeof ArrowRight }> = {
  visitante: {
    href: '/parceiros?entrar=1',
    texto: 'Quero ser parceiro',
    ajuda: 'Entre ou crie sua conta gratuita. Depois, ative seu link de indicação em um clique.',
    Icone: LogIn,
  },
  pode_ativar: {
    href: '/cliente/parceiros',
    texto: 'Ativar meu link de indicação',
    ajuda: 'A ativação é imediata e gratuita, na sua área da Vincis.',
    Icone: ArrowRight,
  },
  parceiro_ativo: {
    href: '/cliente/parceiros',
    texto: 'Abrir meu painel de parceiro',
    ajuda: 'Seu link de indicação já está ativo.',
    Icone: LayoutDashboard,
  },
}

export function ChamadaParticipar({
  situacao,
  centralizar = false,
  className,
}: {
  situacao: SituacaoNaPaginaPublica
  centralizar?: boolean
  className?: string
}) {
  if (situacao === 'sem_area_cliente') {
    return (
      <div className={cn('max-w-xl', centralizar && 'mx-auto', className)}>
        <div className="flex gap-3 rounded-2xl border border-border bg-card/80 p-4 text-left text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            Sua conta atual é de atuação profissional. Hoje, o Programa de Parceiros é ativado pela área do cliente da
            Vincis. Fale com a Vincis para saber como participar.
          </p>
        </div>
        <Link
          href="/contato"
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="size-4" aria-hidden="true" /> Falar com a Vincis
        </Link>
      </div>
    )
  }

  const { href, texto, ajuda, Icone } = DESTINO[situacao]
  return (
    <div className={cn(centralizar && 'text-center', className)}>
      <Link
        href={href}
        className="group inline-flex items-center gap-2 rounded-full bg-gradient-gold px-6 py-3.5 text-sm font-semibold text-on-primary shadow-glow transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {texto}
        <Icone className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
      <p className={cn('mt-3 max-w-md text-sm text-muted-foreground', centralizar && 'mx-auto')}>{ajuda}</p>
    </div>
  )
}
