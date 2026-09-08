'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Compartilhar um endereço, do jeito que o aparelho souber.
 *
 * No celular a Web Share API abre a folha nativa — WhatsApp, e-mail, o que a
 * pessoa usa. No desktop, onde ela quase nunca existe, o clique copia o link e
 * avisa: um botão que não faz nada é pior do que um botão que faz o óbvio.
 *
 * O cancelamento do próprio usuário (`AbortError`) não é falha e não vira
 * aviso de erro — fechar a folha de compartilhamento é uma decisão, não um
 * problema.
 *
 * Nada de biblioteca: as duas APIs usadas aqui são do navegador.
 */
export function BotaoCompartilhar({
  url,
  titulo,
  texto,
  rotulo = 'Compartilhar',
  variant = 'outline',
  size = 'sm',
  className,
}: {
  url: string
  titulo?: string
  texto?: string
  rotulo?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  className?: string
}) {
  const [ocupado, setOcupado] = useState(false)

  async function compartilhar() {
    setOcupado(true)
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: titulo, text: texto, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado para a área de transferência.')
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'AbortError') return
      toast.error('Não foi possível compartilhar. Copie o endereço da página.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={compartilhar}
      disabled={ocupado}
      className={cn('gap-2', className)}
    >
      <Share2 className="size-4" aria-hidden />
      {rotulo}
    </Button>
  )
}
