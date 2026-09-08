'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Número que sobe do zero até o valor.
 *
 * A contagem é decoração, e por isso obedece a `prefers-reduced-motion`: a
 * media query do `globals.css` só desliga transição de CSS, e esta animação
 * roda em JavaScript — sem o `useReducedMotion` ela continuaria correndo para
 * quem pediu ao sistema que não corresse.
 *
 * O primeiro quadro renderiza o valor final, não o zero: assim o servidor e o
 * navegador produzem o mesmo HTML e a hidratação não acusa diferença.
 */
export function NumeroAnimado({
  valor,
  prefixo = '',
  sufixo = '',
  casas = 0,
  duracao = 1200,
}: {
  valor: number
  prefixo?: string
  sufixo?: string
  casas?: number
  duracao?: number
}) {
  const semMovimento = useReducedMotion()
  const [atual, setAtual] = useState(valor)
  const jaRodou = useRef(false)

  useEffect(() => {
    if (semMovimento || jaRodou.current) return
    jaRodou.current = true

    const inicio = performance.now()
    let quadro = 0
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / duracao)
      const suavizado = 1 - Math.pow(1 - p, 3)
      setAtual(valor * suavizado)
      if (p < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, duracao, semMovimento])

  const formatado = atual.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })

  return (
    <span className="tabular-nums">
      {prefixo}
      {formatado}
      {sufixo}
    </span>
  )
}
