import { useState, useCallback } from 'react'

type ModalAberto = 'entrar' | 'cadastro' | null

export function useControleModais() {
  const [modalAberto, setModalAberto] = useState<ModalAberto>(null)

  const abrir = useCallback((modal: 'entrar' | 'cadastro') => {
    console.log('[AUTH] abrir chamado:', modal, 'timestamp:', Date.now())
    document.title = `Modal: ${modal} - Vincis`
    setModalAberto(modal)
    document.body.style.overflow = 'hidden'
  }, [])

  const fechar = useCallback(() => {
    console.log('[AUTH] fechar chamado')
    document.title = 'Vincis'
    setModalAberto(null)
    document.body.style.overflow = ''
  }, [])

  const alternarPara = useCallback((modal: 'entrar' | 'cadastro') => {
    setModalAberto(modal)
  }, [])

  return { modalAberto, abrir, fechar, alternarPara }
}
