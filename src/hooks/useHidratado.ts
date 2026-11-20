import { useSyncExternalStore } from 'react'

/** Nada a observar: o valor só muda uma vez, de "hidratando" para "hidratado". */
const semAssinatura = () => () => {}

/**
 * `false` enquanto o componente está sendo hidratado (e no servidor); `true`
 * depois disso, e também em qualquer montagem feita direto no navegador.
 *
 * Serve para valores que só existem no navegador (sessão no `localStorage`,
 * por exemplo): durante a hidratação o componente precisa desenhar exatamente o
 * HTML do servidor. O React usa o terceiro argumento (`getServerSnapshot`)
 * só na hidratação e, logo depois, desenha de novo com o valor real — sem
 * `useEffect` extra e sem esconder o aviso de hidratação.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(
    semAssinatura,
    () => true,
    () => false,
  )
}
