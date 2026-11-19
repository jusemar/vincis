'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { EstiloCardHome } from '@/features/cms/integracao/cards-home/constantes'
import type { ImagemCardHome } from '@/features/cms/types'
import { VISUAL_CARD_SERVICO } from '../constants/cards-servicos'
import { useLinhasQueCabem } from '../hooks/useLinhasQueCabem'

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
  /** Capa do artigo exibido no card (só artigo da Central com capa). */
  imagem?: ImagemCardHome | null
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

/*
  Card com capa de artigo — a altura externa é a mesma do card sem capa.
  - destaque: layout próprio (ConteudoDestaqueComCapa, abaixo) — imagem em
    cima ocupando o espaço livre, texto compacto embaixo;
  - menor: uma cópia invisível do texto, no layout original, define a altura
    do card; por cima dela, texto e capa lado a lado. Título até 2 linhas e
    resumo com as linhas inteiras que couberem — nunca aumentam o card.
  Imagem dos cards menores: max-w/max-h + object-contain — capa inteira, na
  proporção original, sem corte e sem esticar.
*/
function CapaDoArtigo({ imagem, className }: { imagem: ImagemCardHome; className: string }) {
  return (
    <div className={className}>
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={imagem.url}
          alt={imagem.alt}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
        />
      </div>
    </div>
  )
}

function ConteudoMenorComCapa({
  card,
  imagem,
  textosOriginais,
  classeSelo,
}: {
  card: ConteudoCardServico
  imagem: ImagemCardHome
  textosOriginais: ReactNode
  classeSelo: string
}) {
  const [refResumo, linhasResumo] = useLinhasQueCabem<HTMLDivElement>(2)
  const classes = CLASSES.menor
  return (
    <div className="relative z-10">
      {/* Medidor: mesma estrutura e largura do card sem capa → mesma altura. */}
      <div aria-hidden className={`${classes.conteudo} invisible`}>
        {textosOriginais}
      </div>
      <div className="absolute inset-0 flex gap-4 p-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {card.selo ? <span className={classeSelo}>{card.selo}</span> : null}
          <h3 className={`${classes.titulo} line-clamp-2 shrink-0`}>{card.titulo}</h3>
          {/* A área (flex-1) é medida; o texto mostra só as linhas inteiras que
              cabem nela — max-height em linhas esconde qualquer sobra. */}
          <div ref={refResumo} className="min-h-0 flex-1">
            <p
              className={`${classes.descricao} overflow-hidden`}
              style={{
                display: linhasResumo ? '-webkit-box' : 'none',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: linhasResumo,
                maxHeight: `calc(${linhasResumo} * 1lh)`,
              }}
            >
              {card.descricao}
            </p>
          </div>
          <span className={`${classes.botao} shrink-0`}>
            {card.textoBotao}
            <ArrowRight className={classes.icone} />
          </span>
        </div>
        <CapaDoArtigo imagem={imagem} className="relative w-[34%] max-w-52 shrink-0" />
      </div>
    </div>
  )
}

/**
 * Card grande exibindo artigo com capa: a imagem é a protagonista, o texto
 * vem abaixo, compacto (título menor, até 2 linhas; resumo até 2 linhas;
 * espaçamentos menores).
 * - md+ (desktop/tablet): o card mantém a altura da grade; a imagem ocupa
 *   todo o espaço que o texto compacto deixa (~45–50% do card), de borda a
 *   borda, com object-cover — proporção preservada, recorte só do excedente,
 *   enquadrado um pouco acima do centro (35%), onde capas costumam ter o título
 *   e o rosto;
 * - celular: a imagem tem área 16:9 própria (a capa aparece inteira) e o card
 *   assume a altura natural — a imagem nunca some por causa do título.
 */
function ConteudoDestaqueComCapa({ card, imagem, classeSelo }: { card: ConteudoCardServico; imagem: ImagemCardHome; classeSelo: string }) {
  return (
    <>
      <div className="relative z-10 aspect-video w-full shrink-0 grow overflow-hidden md:aspect-auto md:min-h-0 md:shrink">
        <img
          src={imagem.url}
          alt={imagem.alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover object-[center_35%]"
        />
      </div>
      <div className="relative z-10 flex shrink-0 flex-col gap-2 px-6 pb-5 pt-4">
        {card.selo ? <span className={classeSelo}>{card.selo}</span> : null}
        <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-foreground">{card.titulo}</h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{card.descricao}</p>
        <span className={CLASSES.destaque.botao}>
          {card.textoBotao}
          <ArrowRight className={CLASSES.destaque.icone} />
        </span>
      </div>
    </>
  )
}

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
  const imagem = card.imagem?.url ? card.imagem : null
  const classeSelo = `${visual.selo} text-[11px] font-medium uppercase tracking-wider px-3 py-1 rounded-md w-fit`

  const textos = (
    <>
      {card.selo && (
        <span className={classeSelo}>
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
    </>
  )

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
      {imagem && destaque ? (
        <ConteudoDestaqueComCapa card={card} imagem={imagem} classeSelo={classeSelo} />
      ) : imagem && !destaque ? (
        <ConteudoMenorComCapa card={card} imagem={imagem} textosOriginais={textos} classeSelo={classeSelo} />
      ) : (
        <div className={CLASSES[variante].conteudo}>{textos}</div>
      )}
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
