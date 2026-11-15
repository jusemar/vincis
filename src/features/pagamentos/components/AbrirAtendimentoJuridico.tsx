'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { abrirAtendimentoDoAcordoJuridico } from '@/features/oportunidades/actions/acordo-juridico'

/** Destrava acordo jurídico antigo que ficou sem Atendimento. Não envolve pagamento. */
export function AbrirAtendimentoJuridico({ oportunidadeId }: { oportunidadeId: string }) {
  const router = useRouter()
  const [enviando, iniciar] = useTransition()
  return (
    <Button
      size="sm"
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          const resultado = await abrirAtendimentoDoAcordoJuridico({ oportunidadeId })
          if (!resultado.sucesso) toast.error(resultado.mensagem)
          else {
            toast.success(resultado.mensagem)
            router.refresh()
          }
        })
      }
    >
      {enviando ? 'Abrindo…' : 'Abrir atendimento'}
    </Button>
  )
}
