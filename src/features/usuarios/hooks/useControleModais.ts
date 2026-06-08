import { useState, useCallback } from 'react'

type ModalAberto = 'entrar' | 'cadastro' | null

export function useControleModais() {
  const [modalAberto, setModalAberto] = useState<ModalAberto>(null)

  const abrir = useCallback((modal: 'entrar' | 'cadastro') => {
    setModalAberto(modal)
    document.body.style.overflow = 'hidden'
  }, [])

  const fechar = useCallback(() => {
    setModalAberto(null)
    document.body.style.overflow = ''
  }, [])

  const alternarPara = useCallback((modal: 'entrar' | 'cadastro') => {
    setModalAberto(modal)
  }, [])

  return { modalAberto, abrir, fechar, alternarPara }
}
