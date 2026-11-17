'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { EstiloCardHome } from '@/features/cms/integracao/cards-home/constantes'
import { VISUAL_CARD_SERVICO } from '../constants/cards-servicos'

/**
 * Um card de serviço da Home, nas duas variantes do layout original:
 * `destaque` (o grande, à esquerda) e `menor` (os da direita).
 *
 * As classes são as mesmas dos cards fixos que existiam antes; o que mudou:
 * - o card inteiro é um link (`href`), com foco visível de teclado;
 * - o "botão" virou `span` com a mesma aparência — botão dentro de link seria
 *   um elemento interativo aninhado, e o clique já é do card;
 * - sem `href` o card é só visual (pré-visualização da Gestão).
 */
export type ConteudoCardServico = {
  selo: string | null
  titulo: string
  descricao: string
  textoBotao: string
  estilo: EstiloCardHome
}

const MotionLink = motion.create(Link)

/**
 * Strings copiadas literalmente dos cards fixos anteriores. Não passam pelo
 * `cn` (tailwind-merge): ele descartaria o `leading-*` que vem antes do
 * `text-*` e mudaria a altura das linhas.
 */
const CLASSES = {
  destaque: {
    card: 'bg-card rounded-2xl border border-border relative overflow-hidden flex flex-col justify-end min-h-[400px] cursor-pointer shadow-card',
    conteudo: 'relative z-10 p-7 flex flex-col gap-4',
    titulo: 'text-2xl font-semibold text-foreground leading-tight whitespace-pre-line',
    descricao: 'text-sm text-muted-foreground leading-relaxed',
    botao:
      'mt-1 inline-flex items-center gap-2 text-sm font-semibold text-foreground px-4 py-2 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-all w-fit',
    icone: 'w-4 h-4',
  },
  menor: {
    card: 'bg-card rounded-2xl border border-border relative overflow-hidden flex flex-col justify-end min-h-[190px] cursor-pointer shadow-card',
    conteudo: 'relative z-10 p-6 flex flex-col gap-3',
    titulo: 'text-base font-semibold text-foreground leading-tight whitespace-pre-line',
    descricao: 'text-xs text-muted-foreground leading-relaxed',
    botao:
      'mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-all w-fit',
    icone: 'w-3.5 h-3.5',
  },
} as const

/** Anel só no foco por teclado: com mouse ou toque, nada muda no visual. */
const FOCO_VISIVEL =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function CardServicoHome({
  card,
  variante,
  href,
  className,
  style,
}: {
  card: ConteudoCardServico
  variante: 'destaque' | 'menor'
  href?: string
  className?: string
  style?: CSSProperties
}) {
  const [realcado, setRealcado] = useState(false)
  const visual = VISUAL_CARD_SERVICO[card.estilo]
  const destaque = variante === 'destaque'

  const conteudo = (
    <>
      {/* Glow effect */}
      <div
        className={
          destaque
            ? `absolute -top-10 -right-10 w-64 h-64 rounded-full bg-gradient-to-br ${visual.brilho} pointer-events-none transition-opacity duration-500 ${realcado ? "opacity-100" : "opacity-50"}`
            : `absolute ${visual.posicaoBrilhoMenor} w-48 h-48 rounded-full bg-gradient-to-br ${visual.brilho} pointer-events-none transition-opacity duration-500 ${realcado ? "opacity-100" : "opacity-50"}`
        }
      />

      {/* Content */}
      <div className={CLASSES[variante].conteudo}>
        {card.selo && (
          <span
            className={`${visual.selo} text-[11px] font-medium uppercase tracking-wider px-3 py-1 rounded-md w-fit`}
          >
            {card.selo}
          </span>
        )}

        <h3 className={CLASSES[variante].titulo}>{card.titulo}</h3>

        <p className={CLASSES[variante].descricao}>{card.descricao}</p>

        {/* CTA — aparência de botão; o clique é do card inteiro. */}
        <span className={CLASSES[variante].botao}>
          {card.textoBotao}
          <ArrowRight className={CLASSES[variante].icone} />
        </span>
      </div>
    </>
  )

  const comum = {
    className: className ? `${CLASSES[variante].card} ${className}` : CLASSES[variante].card,
    style,
    onMouseEnter: () => setRealcado(true),
    onMouseLeave: () => setRealcado(false),
    whileHover: { y: -4 },
    transition: { duration: 0.3 },
  }

  if (!href) return <motion.div {...comum}>{conteudo}</motion.div>

  return (
    <MotionLink
      {...comum}
      href={href}
      className={`${comum.className} ${FOCO_VISIVEL}`}
      onFocus={() => setRealcado(true)}
      onBlur={() => setRealcado(false)}
    >
      {conteudo}
    </MotionLink>
  )
}
