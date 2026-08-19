'use client'

import type { ReactNode } from 'react'
import { useAuth } from '@/features/usuarios'
import { TempoRealProvider } from './TempoRealProvider'

/**
 * Liga o tempo real à sessão atual.
 *
 * Fica entre o `AuthProvider` e o resto da aplicação porque o canal pessoal é
 * o do usuário logado: sem sessão não há canal a assinar, e trocar de conta
 * precisa trocar de canal. Enquanto `usuario` for nulo o provider existe mas
 * não assina nada — as telas públicas não abrem WebSocket à toa.
 */
export function TempoRealDaSessao({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  return (
    <TempoRealProvider usuarioId={usuario?.id}>{children}</TempoRealProvider>
  )
}
