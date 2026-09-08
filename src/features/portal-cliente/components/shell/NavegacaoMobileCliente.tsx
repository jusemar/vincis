'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ClipboardList,
  Handshake,
  Headphones,
  LayoutGrid,
  Menu,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  SECOES_PARCEIRO,
  rotaDaSecao,
  secaoDaRota,
} from '@/features/parceiros/constants/navegacao'
import { iconeDaSecao } from '@/features/parceiros/components/cliente/icones-secao'
import {
  AREAS_CLIENTE,
  ROTA_CLIENTE,
  areaDaRota,
  ehRotaDeParceiros,
} from '../../constants/navegacao'

/**
 * Navegação da Área do Cliente no celular.
 *
 * Mesma solução do painel administrativo: barra fixa embaixo com os destinos do
 * dia a dia, uma última coluna "Mais" e uma gaveta com o restante. A barra
 * respeita a safe area, e o conteúdo reserva o espaço dela pelo
 * `padding-bottom` do `<main>` do shell.
 *
 * As quatro áreas principais ficam na barra; "Minha conta" e as seções de
 * Parceiros ficam na gaveta — treze seções não cabem numa barra de cinco
 * colunas, e o menu lateral já as tem por completo em telas maiores.
 *
 * Na barra, Parceiros leva ao Dashboard: ali não existe o gesto de "abrir o
 * grupo sem sair da página" — quem quer a lista inteira abre "Mais".
 */
const ICONE_DA_AREA: Record<string, LucideIcon> = {
  visao: LayoutGrid,
  orcamentos: ClipboardList,
  atendimentos: Headphones,
  parceiros: Handshake,
  conta: UserRound,
}

const NA_BARRA = ['visao', 'orcamentos', 'atendimentos', 'parceiros']

export function NavegacaoMobileCliente({
  gavetaAberta,
  onGaveta,
}: {
  gavetaAberta: boolean
  onGaveta: (aberta: boolean) => void
}) {
  const caminho = usePathname() ?? ROTA_CLIENTE
  const areaAtiva = areaDaRota(caminho)?.id
  const secaoAtiva = secaoDaRota(caminho)

  const principais = AREAS_CLIENTE.filter((area) => NA_BARRA.includes(area.id))
  const naGaveta = AREAS_CLIENTE.filter((area) => !NA_BARRA.includes(area.id))
  const foraDaBarra = !areaAtiva || !NA_BARRA.includes(areaAtiva)

  return (
    <>
      <nav
        aria-label="Áreas da sua conta"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {principais.map((area) => {
            const Icone = ICONE_DA_AREA[area.id] ?? LayoutGrid
            const ativo = area.id === areaAtiva
            return (
              <Link
                key={area.id}
                href={area.rota}
                aria-current={ativo ? 'page' : undefined}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
                  ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icone className="size-5" aria-hidden />
                <span className="truncate">{area.rotulo}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => onGaveta(true)}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors ${
              foraDaBarra ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            }`}
          >
            <Menu className="size-5" aria-hidden />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Drawer open={gavetaAberta} onOpenChange={onGaveta}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Mais opções</DrawerTitle>
            <DrawerDescription>
              Acesse as demais áreas da sua conta.
            </DrawerDescription>
          </DrawerHeader>
          <div className="rolagem-contida max-h-[60dvh] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <nav className="grid grid-cols-2 gap-2">
              {naGaveta.map((area) => {
                const Icone = ICONE_DA_AREA[area.id] ?? LayoutGrid
                const ativo = area.id === areaAtiva
                return (
                  <Link
                    key={area.id}
                    href={area.rota}
                    onClick={() => onGaveta(false)}
                    aria-current={ativo ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors hover:bg-accent ${
                      ativo ? 'border-primary bg-primary/10' : 'bg-card'
                    }`}
                  >
                    <Icone className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 truncate">{area.rotulo}</span>
                  </Link>
                )
              })}
            </nav>

            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Parceiros
            </p>
            <nav className="grid grid-cols-2 gap-2">
              {SECOES_PARCEIRO.map((secao) => {
                const Icone = iconeDaSecao(secao.id)
                const ativo = ehRotaDeParceiros(caminho) && secao.id === secaoAtiva
                return (
                  <Link
                    key={secao.id}
                    href={rotaDaSecao(secao.id)}
                    onClick={() => onGaveta(false)}
                    aria-current={ativo ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors hover:bg-accent ${
                      ativo ? 'border-primary bg-primary/10' : 'bg-card'
                    }`}
                  >
                    <Icone className="size-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 truncate">{secao.rotulo}</span>
                  </Link>
                )
              })}
            </nav>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
