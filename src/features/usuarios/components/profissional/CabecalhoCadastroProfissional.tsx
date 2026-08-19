'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, ShieldCheck } from 'lucide-react'
import ThemeToggle from '@/components/shared/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/usuarios'

export function CabecalhoCadastroProfissional({ nome, subtitulo = 'Cadastro profissional' }: { nome: string; subtitulo?: string }) {
  const router = useRouter()
  const { logout } = useAuth()
  const [saindo, setSaindo] = useState(false)
  async function sair() { setSaindo(true); await logout(); router.replace('/'); router.refresh() }
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()
  return <header className="border-b bg-card/90 backdrop-blur-xl"><div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
    <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5"/></span><div><p className="font-serif text-lg font-semibold leading-none">Vincis</p><p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p></div></div>
    <div className="flex items-center gap-2"><ThemeToggle/><span className="hidden items-center gap-2 text-sm font-medium sm:flex"><span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{iniciais}</span>{nome}</span><Button size="sm" variant="outline" disabled={saindo} onClick={() => void sair()}><LogOut/>{saindo ? 'Saindo...' : 'Sair'}</Button></div>
  </div></header>
}
