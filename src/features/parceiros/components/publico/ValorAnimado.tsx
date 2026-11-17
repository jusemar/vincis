'use client'

import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { formatarReais } from '../../lib/simulacao'

/**
 * Valor em reais que desliza do número anterior para o novo.
 *
 * O componente antigo (`AnimatedNumber`) só animava na primeira montagem: um
 * `ref` impedia qualquer animação seguinte, e o simulador continuava mostrando
 * o valor inicial depois que o visitante mexia nos campos. Aqui cada mudança
 * anima a partir do valor atual, e o texto final é sempre o valor exato,
 * formatado com centavos. Com `prefers-reduced-motion`, troca na hora.
 *
 * Leitores de tela ouvem só o valor final (`aria-live` fica em quem envolve,
 * e o texto intermediário é escondido deles).
 */
export function ValorAnimado({ centavos, className }: { centavos: number; className?: string }) {
  const reduzir = useReducedMotion()
  const [exibido, setExibido] = useState(centavos)
  const atual = useRef(centavos)

  useEffect(() => {
    if (reduzir) {
      // Sem animação: a tela usa `centavos` direto (abaixo); só o ponto de partida acompanha.
      atual.current = centavos
      return
    }
    const controle = animate(atual.current, centavos, {
      duration: 0.45,
      ease: 'easeOut',
      onUpdate: (v) => {
        atual.current = v
        setExibido(Math.round(v))
      },
      onComplete: () => {
        atual.current = centavos
        setExibido(centavos)
      },
    })
    return () => controle.stop()
  }, [centavos, reduzir])

  return (
    <span className={className}>
      <span aria-hidden="true">{formatarReais(reduzir ? centavos : exibido)}</span>
      <span className="sr-only">{formatarReais(centavos)}</span>
    </span>
  )
}
