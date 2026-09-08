'use client'

import { useSyncExternalStore } from 'react'

const CHAVE = 'vincis-menu-cliente-recolhido'

/**
 * O menu está recolhido? Guardado fora do React, de propósito.
 *
 * Duas exigências ao mesmo tempo: o estado precisa **sobreviver à navegação**
 * (quem recolheu o menu não quer vê-lo abrir de novo a cada clique) e o
 * primeiro quadro do servidor precisa bater com o do navegador, ou a
 * hidratação acusa diferença.
 *
 * `useSyncExternalStore` resolve os dois: o servidor rende com o padrão
 * (aberto), e o navegador troca para o valor guardado logo depois. Ler o
 * `localStorage` dentro de um `useEffect` com `setState` faria a mesma coisa,
 * mas com um render em cascata — que é justamente o que a regra de lint do
 * projeto proíbe.
 *
 * O `catch` cobre navegador sem armazenamento (janela privada, site data
 * bloqueado): ali o menu simplesmente começa aberto e continua funcionando.
 */
const ouvintes = new Set<() => void>()

/**
 * Valor em memória.
 *
 * É a fonte quando o armazenamento do navegador não pode ser usado — sem ele,
 * o clique em "Recolher menu" não faria nada numa janela privada. Espelha o
 * `localStorage` quando ele existe.
 */
let emMemoria = false

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar)
  // Duas abas abertas na Área do Cliente ficam de acordo entre si.
  window.addEventListener('storage', aoMudar)
  return () => {
    ouvintes.delete(aoMudar)
    window.removeEventListener('storage', aoMudar)
  }
}

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    return emMemoria
  }
}

/** No servidor não há preferência guardada: o menu nasce aberto. */
function lerNoServidor(): boolean {
  return false
}

export function useMenuRecolhido(): [boolean, () => void] {
  const recolhido = useSyncExternalStore(assinar, ler, lerNoServidor)

  function alternar() {
    const proximo = !ler()
    emMemoria = proximo
    try {
      localStorage.setItem(CHAVE, proximo ? '1' : '0')
    } catch {
      // Sem armazenamento a preferência vale só para esta visita — e o menu
      // continua respondendo ao clique, que é o que importa aqui.
    }
    ouvintes.forEach((aoMudar) => aoMudar())
  }

  return [recolhido, alternar]
}
