'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Handshake,
  Headphones,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
 * O menu da Área do Cliente. Um só, para todas as páginas.
 *
 * ## Por que não usa as classes `.sidebar` do painel
 *
 * A linguagem visual é a mesma — 72px recolhida, 248px aberta, item ativo em
 * âmbar com filete à esquerda —, mas o `globals.css` do painel expande a barra
 * **no hover** (`@media (hover: hover) { .sidebar:hover { width: 220px } }`), e
 * aqui o estado precisa ser estável e decidido por clique. Reaproveitar aquela
 * classe traria o hover junto; mudá-la mexeria no painel do prestador, que não
 * é o assunto desta tela. Então: mesmo desenho, escrito com as utilidades do
 * projeto, sem nenhuma regra de hover que altere a largura.
 *
 * ## Parceiros é agrupador, não destino
 *
 * Clicar na linha "Parceiros" abre e fecha a lista de seções e **não navega**.
 * Quem navega são as seções, cada uma com a própria rota. Um item que abrisse o
 * Dashboard e ao mesmo tempo expandisse a lista faria o mesmo clique significar
 * duas coisas — e a pessoa perderia a página só por querer olhar o que há
 * dentro do grupo.
 *
 * Com a barra recolhida não há onde desenhar treze filhos: ali o botão leva ao
 * Dashboard do módulo, que é a raiz do grupo.
 */
const ICONE_DA_AREA: Record<string, LucideIcon> = {
  visao: LayoutGrid,
  orcamentos: ClipboardList,
  atendimentos: Headphones,
  parceiros: Handshake,
  conta: UserRound,
}

/** Uma linha do menu — o mesmo desenho para item, filho e botão. */
function LinhaDoMenu({
  icone: Icone,
  rotulo,
  ativo = false,
  recolhida = false,
  filho = false,
  sufixo,
}: {
  icone: LucideIcon
  rotulo: string
  ativo?: boolean
  recolhida?: boolean
  filho?: boolean
  sufixo?: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'relative flex w-full items-center gap-3 rounded-lg py-2.5 text-sm transition-colors',
        recolhida ? 'justify-center px-0' : filho ? 'pl-11 pr-3' : 'px-3',
        ativo
          ? 'bg-primary/10 font-medium text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {ativo ? (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
        />
      ) : null}
      <Icone className={cn('size-[18px] shrink-0', filho && 'size-4')} aria-hidden />
      {recolhida ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{rotulo}</span>
          {sufixo}
        </>
      )}
    </span>
  )
}

export function MenuLateralCliente({
  recolhida,
  submenuAberto,
  onAlternarRecolhida,
  onAlternarSubmenu,
  onNavegar,
  emGaveta = false,
}: {
  /** Só ícones. Estado estável, decidido por clique — nunca por hover. */
  recolhida: boolean
  submenuAberto: boolean
  onAlternarRecolhida: () => void
  onAlternarSubmenu: () => void
  /** Fecha a gaveta ao navegar, no celular. */
  onNavegar?: () => void
  /** A barra está servindo de gaveta sobreposta (abaixo de `lg`). */
  emGaveta?: boolean
}) {
  const caminho = usePathname() ?? ROTA_CLIENTE
  const areaAtiva = areaDaRota(caminho)?.id
  const secaoAtiva = secaoDaRota(caminho)
  const compacta = recolhida && !emGaveta

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r bg-card transition-[width] duration-300 ease-out',
        compacta ? 'w-[72px]' : emGaveta ? 'w-[260px]' : 'w-[248px]',
        emGaveta && 'fixed inset-y-0 left-0 z-[200] shadow-2xl',
      )}
    >
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-3 border-b px-3',
          compacta && 'justify-center px-0',
        )}
      >
        <Link
          href={ROTA_CLIENTE}
          onClick={onNavegar}
          className="flex min-w-0 items-center gap-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
            <span className="font-serif text-base font-bold">V</span>
          </span>
          {compacta ? null : (
            <span className="min-w-0">
              <span className="block truncate font-serif text-base font-semibold leading-none">
                Vincis
              </span>
              <span className="mt-1 block truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Minha área
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Áreas da sua conta"
        className="rolagem-contida flex-1 space-y-1 overflow-y-auto p-2"
      >
        {AREAS_CLIENTE.map((area) => {
          const Icone = ICONE_DA_AREA[area.id] ?? LayoutGrid
          const ativo = area.id === areaAtiva

          // Agrupador aberto: abre e fecha a lista, sem sair da página.
          if (area.agrupador && !compacta) {
            return (
              <div key={area.id}>
                <button
                  type="button"
                  onClick={onAlternarSubmenu}
                  aria-expanded={submenuAberto}
                  aria-controls="submenu-parceiros"
                  className="w-full"
                >
                  <LinhaDoMenu
                    icone={Icone}
                    rotulo={area.rotulo}
                    ativo={ativo}
                    sufixo={
                      submenuAberto ? (
                        <ChevronDown className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 shrink-0" aria-hidden />
                      )
                    }
                  />
                </button>

                {submenuAberto ? (
                  <motion.ul
                    id="submenu-parceiros"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-1 space-y-0.5 overflow-hidden"
                  >
                    {SECOES_PARCEIRO.map((secao) => {
                      const IconeSecao = iconeDaSecao(secao.id)
                      const secaoAcesa =
                        ehRotaDeParceiros(caminho) && secao.id === secaoAtiva
                      return (
                        <li key={secao.id}>
                          <Link
                            href={rotaDaSecao(secao.id)}
                            onClick={onNavegar}
                            aria-current={secaoAcesa ? 'page' : undefined}
                          >
                            <LinhaDoMenu
                              icone={IconeSecao}
                              rotulo={secao.rotulo}
                              ativo={secaoAcesa}
                              filho
                            />
                          </Link>
                        </li>
                      )
                    })}
                  </motion.ul>
                ) : null}
              </div>
            )
          }

          return (
            <Link
              key={area.id}
              href={area.rota}
              onClick={onNavegar}
              aria-current={ativo ? 'page' : undefined}
              title={compacta ? area.rotulo : undefined}
            >
              <LinhaDoMenu
                icone={Icone}
                rotulo={area.rotulo}
                ativo={ativo}
                recolhida={compacta}
              />
            </Link>
          )
        })}
      </nav>

      {/* Recolher é ato deliberado, e o botão vive fora da lista de destinos. */}
      {emGaveta ? null : (
        <div className="shrink-0 border-t p-2">
          <button
            type="button"
            onClick={onAlternarRecolhida}
            aria-pressed={recolhida}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              compacta ? 'justify-center px-0' : 'px-3',
            )}
          >
            {recolhida ? (
              <PanelLeftOpen className="size-[18px]" aria-hidden />
            ) : (
              <PanelLeftClose className="size-[18px]" aria-hidden />
            )}
            {compacta ? null : <span>Recolher menu</span>}
          </button>
        </div>
      )}
    </aside>
  )
}
