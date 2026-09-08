'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Copiar um texto curto (link, cupom) para a área de transferência.
 *
 * O aviso vai pelo Sonner que a plataforma já configura em `providers.tsx` —
 * nenhum balão próprio. A confirmação também aparece no próprio botão por
 * dois segundos, porque quem clicou está olhando para ele, e não para o canto
 * da tela.
 *
 * `navigator.clipboard` não existe em contexto inseguro nem em todo navegador
 * antigo: a falha vira um aviso que diz o que fazer, em vez de um clique que
 * não faz nada.
 */
export function BotaoCopiar({
  texto,
  rotulo = 'Copiar',
  rotuloCopiado = 'Copiado',
  variant = 'outline',
  size = 'sm',
  className,
  apenasIcone = false,
}: {
  texto: string
  rotulo?: string
  rotuloCopiado?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
  apenasIcone?: boolean
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success('Copiado', { description: texto })
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar', {
        description: 'Selecione o texto e copie manualmente.',
      })
    }
  }

  const Icone = copiado ? Check : Copy

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copiar}
      className={cn(className)}
      aria-label={apenasIcone ? `${rotulo} ${texto}` : undefined}
    >
      <Icone className="size-4" aria-hidden />
      {apenasIcone ? null : copiado ? rotuloCopiado : rotulo}
    </Button>
  )
}
