'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { pagarAcordoSimulado } from '../actions/pagamento-simulado'

/**
 * A única parte interativa da simulação de pagamento.
 *
 * O campo de valor **só aparece** quando o acordo fechou com "a combinar" — é o
 * ponto provisório do fluxo, e ele se anuncia como tal na própria tela em vez
 * de aceitar um número em silêncio. Quando o acordo já tem preço, não há campo
 * nenhum: o valor vem do servidor e o que o navegador mandasse seria ignorado
 * de qualquer forma.
 *
 * O botão desabilitado durante a transição é conforto visual. A garantia de
 * não duplicar está no banco — índice único por oportunidade no pagamento e no
 * Atendimento —, então F5 no meio, duas abas ou dois cliques convergem para o
 * mesmo protocolo.
 */
export function FormularioPagamentoSimulado({
  oportunidadeId,
  precisaInformarValor,
}: {
  oportunidadeId: string
  precisaInformarValor: boolean
}) {
  const router = useRouter()
  const [valor, setValor] = useState('')
  const [processando, iniciarTransicao] = useTransition()

  function pagar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await pagarAcordoSimulado({
        oportunidadeId,
        valorAcordado: valor,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  return (
    <form className="space-y-4" onSubmit={pagar}>
      {precisaInformarValor ? (
        <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <Label htmlFor="valor-acordado" className="text-sm font-semibold">
            Valor combinado
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Esta proposta foi aceita com o valor a combinar. Informe o valor que
            vocês combinaram para concluir a simulação — a plataforma não inventa
            um preço no seu lugar.
          </p>
          <Input
            id="valor-acordado"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="1.200,00"
            className="mt-2 max-w-48"
            required
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={processando}>
          {processando ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Processando...
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" aria-hidden />
              Concluir pagamento simulado
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Nenhuma cobrança é feita e nenhum dado de cartão é solicitado.
        </p>
      </div>
    </form>
  )
}
