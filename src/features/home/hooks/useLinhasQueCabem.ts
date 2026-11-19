'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Quantas linhas inteiras de um texto cabem na altura que o layout reservou
 * para ele: o ref vai no contêiner (`flex-1 min-h-0`) e o texto é o primeiro
 * filho — medir o contêiner evita que o próprio corte altere a medida. Usado no card da Home com capa: o
 * resumo mostra só linhas completas — nada cortado ao meio — sem que o texto
 * empurre a altura do card.
 *
 * Recalcula quando a área muda (largura da tela, fontes carregadas).
 */
export function useLinhasQueCabem<T extends HTMLElement>(inicial: number) {
  const ref = useRef<T>(null)
  const [linhas, setLinhas] = useState(inicial)

  useLayoutEffect(() => {
    const elemento = ref.current
    if (!elemento) return
    const medir = () => {
      // A altura de linha vem do texto (primeiro filho); a área, do contêiner.
      const texto = (elemento.firstElementChild as HTMLElement | null) ?? elemento
      const alturaLinha = parseFloat(getComputedStyle(texto).lineHeight)
      if (!alturaLinha) return
      setLinhas(Math.max(0, Math.floor((elemento.clientHeight + 0.5) / alturaLinha)))
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return [ref, linhas] as const
}
