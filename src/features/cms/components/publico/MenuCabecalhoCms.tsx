'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { ItemMenuPublico } from '../../nucleo/lib/arvore-navegacao'

/**
 * Itens do menu do cabeçalho vindos do CMS, no desenho do `NavigationNext`.
 *
 * Só a navegação: logo, tema, entrar/sair e conta continuam no cabeçalho, fora
 * do CMS. Desktop e mobile recebem a mesma árvore — a diferença é só a forma.
 *
 * Agrupador segue o padrão de *disclosure* do WAI-ARIA: um botão com
 * `aria-expanded` que mostra a lista de links. Abre por clique, Enter ou
 * Espaço (nada depende de hover); Esc fecha e devolve o foco ao botão; clicar
 * fora, sair com Tab ou trocar de página também fecham.
 */
const CLASSE_LINK_DESKTOP =
  'relative px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group whitespace-nowrap rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const CLASSE_LINK_MOBILE =
  'flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Sublinhado({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-primary transition-all duration-300 ${
        ativo ? 'w-1/2' : 'w-0 group-hover:w-1/2'
      }`}
    />
  )
}

function SubmenuDesktop({ item, pathname }: { item: ItemMenuPublico; pathname: string }) {
  // Guarda em qual página o submenu foi aberto: trocar de página o fecha sem
  // precisar de efeito.
  const [abertoEm, setAbertoEm] = useState<string | null>(null)
  const aberto = abertoEm === pathname
  const setAberto = (valor: boolean | ((atual: boolean) => boolean)) =>
    setAbertoEm((atual) => {
      const proximo = typeof valor === 'function' ? valor(atual === pathname) : valor
      return proximo ? pathname : null
    })
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const idPainel = useId()
  const ativo = item.filhos.some((filho) => filho.href === pathname)

  useEffect(() => {
    if (!aberto) return
    const fecharFora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAbertoEm(null)
    }
    const fecharEsc = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      setAbertoEm(null)
      botao.current?.focus()
    }
    document.addEventListener('pointerdown', fecharFora)
    document.addEventListener('keydown', fecharEsc)
    return () => {
      document.removeEventListener('pointerdown', fecharFora)
      document.removeEventListener('keydown', fecharEsc)
    }
  }, [aberto])

  return (
    <div
      ref={raiz}
      className="relative"
      onBlur={(evento) => {
        if (!raiz.current?.contains(evento.relatedTarget as Node | null)) setAberto(false)
      }}
    >
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((valor) => !valor)}
        className={`${CLASSE_LINK_DESKTOP} inline-flex items-center gap-1`}
      >
        {item.texto}
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
        <Sublinhado ativo={ativo} />
      </button>
      {aberto && (
        <ul
          id={idPainel}
          className="glass-card absolute left-0 top-full z-50 mt-2 min-w-48 rounded-xl p-2 shadow-lg"
        >
          {item.filhos.map((filho) => (
            <li key={filho.id}>
              <Link
                href={filho.href!}
                aria-current={filho.href === pathname ? 'page' : undefined}
                onClick={() => setAberto(false)}
                className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-foreground"
              >
                {filho.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MenuCmsDesktop({ itens, pathname }: { itens: ItemMenuPublico[]; pathname: string }) {
  return (
    <>
      {itens.map((item) =>
        item.href ? (
          <Link
            key={item.id}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={CLASSE_LINK_DESKTOP}
          >
            {item.texto}
            <Sublinhado ativo={pathname === item.href} />
          </Link>
        ) : (
          <SubmenuDesktop key={item.id} item={item} pathname={pathname} />
        ),
      )}
    </>
  )
}

function SubmenuMobile({ item, aoNavegar }: { item: ItemMenuPublico; aoNavegar: () => void }) {
  const [aberto, setAberto] = useState(false)
  const idPainel = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((valor) => !valor)}
        className={`${CLASSE_LINK_MOBILE} w-full justify-between text-left`}
      >
        {item.texto}
        <ChevronDown
          aria-hidden
          className={`size-5 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>
      {aberto && (
        <ul id={idPainel} className="ml-4 border-l border-border pl-2">
          {item.filhos.map((filho) => (
            <li key={filho.id}>
              <Link href={filho.href!} onClick={aoNavegar} className={CLASSE_LINK_MOBILE}>
                {filho.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MenuCmsMobile({
  itens,
  aoNavegar,
}: {
  itens: ItemMenuPublico[]
  aoNavegar: () => void
}) {
  return (
    <>
      {itens.map((item) =>
        item.href ? (
          <Link key={item.id} href={item.href} onClick={aoNavegar} className={CLASSE_LINK_MOBILE}>
            {item.texto}
          </Link>
        ) : (
          <SubmenuMobile key={item.id} item={item} aoNavegar={aoNavegar} />
        ),
      )}
    </>
  )
}
