'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Handshake } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ativarParceiro } from '../../actions/ativar-parceiro'

/**
 * O clique que cria o link de indicação.
 *
 * Fica dentro do card "Link de indicação" e ocupa o lugar do endereço enquanto
 * ele não existe — nenhum bloco novo, nenhuma tela de adesão. A ativação é
 * imediata: não há análise, aprovação nem espera, e por isso o botão não abre
 * formulário, confirmação ou termo.
 *
 * `router.refresh()` porque o link é renderizado no servidor: depois de gravar,
 * quem monta o card de novo é a página, com o código real vindo do banco.
 */
export function AtivarParceiro() {
  const router = useRouter()
  const [ativando, iniciarTransicao] = useTransition()

  function ativar() {
    iniciarTransicao(async () => {
      const resultado = await ativarParceiro()
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 flex flex-1 flex-col justify-center rounded-xl border border-dashed bg-muted/20 p-4 text-center">
      <Handshake className="mx-auto size-6 text-primary" aria-hidden />
      <p className="mt-3 text-sm text-muted-foreground">
        Ative o Programa de Parceiros para receber o seu link permanente de
        indicação.
      </p>
      <Button className="mt-4 self-center" onClick={ativar} disabled={ativando}>
        {ativando ? 'Ativando…' : 'Ativar meu link'}
      </Button>
    </div>
  )
}
