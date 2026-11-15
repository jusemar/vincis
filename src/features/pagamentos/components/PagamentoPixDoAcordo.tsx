'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  acompanharPagamentoDoAcordo,
  iniciarPagamentoDoAcordo,
  type ResultadoPixAcordo,
} from '../actions/pagamento-acordo'
import { useAcompanharCobranca } from '../hooks/useAcompanharCobranca'
import type { CobrancaPixDTO } from '../types/cobranca'
import { PainelPix } from './PainelPix'

/**
 * Pagamento por Pix do acordo fechado de uma solicitação de orçamento.
 *
 * Substitui a simulação: o valor é o acordado (do banco), o Pix é emitido pela
 * Efí e o Atendimento só nasce quando ela confirma. Confirmado, a página é
 * recarregada do servidor — que passa a mostrar o comprovante e o protocolo.
 */
export function PagamentoPixDoAcordo({ oportunidadeId }: { oportunidadeId: string }) {
  const router = useRouter()
  const [cobranca, setCobranca] = useState<CobrancaPixDTO | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciarEnvio] = useTransition()

  function aplicar(resposta: ResultadoPixAcordo) {
    if (resposta.situacao === 'cobranca') {
      setCobranca(resposta.cobranca)
      setErro(null)
      return
    }
    if (resposta.situacao === 'pago') {
      router.refresh()
      return
    }
    if (resposta.situacao === 'gerando') {
      setTimeout(gerar, 2000)
      return
    }
    setErro(resposta.mensagem)
  }

  function gerar() {
    iniciarEnvio(async () => aplicar(await iniciarPagamentoDoAcordo({ oportunidadeId })))
  }

  useAcompanharCobranca({
    ativo: cobranca?.status === 'aguardando_pagamento',
    consultar: () => acompanharPagamentoDoAcordo({ oportunidadeId }),
    aoResponder: aplicar,
  })

  if (!cobranca && !enviando) {
    return (
      <div className="space-y-3">
        <Button type="button" size="lg" onClick={gerar}>
          <QrCode className="size-4" aria-hidden />
          Pagar com Pix
        </Button>
        <p className="text-xs text-muted-foreground">
          O atendimento é aberto assim que o pagamento for confirmado pela instituição financeira.
        </p>
        {erro ? <p role="alert" className="text-sm font-medium text-destructive">{erro}</p> : null}
      </div>
    )
  }

  return <PainelPix cobranca={cobranca} gerando={enviando && !cobranca} erro={erro} onGerarNovamente={gerar} />
}
