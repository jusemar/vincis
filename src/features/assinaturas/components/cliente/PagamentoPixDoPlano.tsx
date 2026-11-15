'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PainelPix } from '@/features/pagamentos/components/PainelPix'
import { useAcompanharCobranca } from '@/features/pagamentos/hooks/useAcompanharCobranca'
import type { CobrancaPixDTO } from '@/features/pagamentos/types/cobranca'
import {
  acompanharPagamentoDoPlano,
  iniciarPagamentoDoPlano,
  type ResultadoPixPlano,
} from '../../actions/pagamento-plano'
import { escolherContadorDoPlanoPendente } from '../../actions/escolher-contador-pendente'
import { OPCAO_VINCIS_ESCOLHE } from '../../constants/contador-responsavel'
import type { ContadorParceiroPublico } from '@/features/profissionais/queries/contadores-parceiros'

/**
 * Pagamento por Pix do plano contratado em `/precos` — e das mensalidades.
 *
 * Paga o que está em aberto agora — o período inteiro, o primeiro mês do
 * mensal ou, no plano mensal ativo, a mensalidade devida. É a confirmação da
 * Efí, no servidor, que ativa o contrato ou quita o mês. A tela só mostra a
 * situação que o servidor informa.
 */
export function PagamentoPixDoPlano({
  assinaturaId,
  iniciarAutomaticamente = false,
  onPago,
  rotuloBotao = 'Pagar com Pix',
  mensagemPago = 'Pagamento confirmado. Seu plano está ativo.',
}: {
  assinaturaId: string
  /** Texto do botão que gera o Pix ("Pagar mensalidade" na renovação). */
  rotuloBotao?: string
  /** O que aparece quando o servidor confirma o pagamento. */
  mensagemPago?: string
  /**
   * Gera o Pix assim que aparece, sem pedir um segundo clique. A contratação
   * acabou de ser confirmada: exigir "Pagar com Pix" de novo deixava o Cliente
   * parado num "registrada" sem cobrança (foi o que aconteceu no card da
   * Contabilidade). O servidor reaproveita a cobrança viva — repetir não duplica.
   */
  iniciarAutomaticamente?: boolean
  /** Avisado quando o servidor confirma o pagamento com a Efí. */
  onPago?: () => void
}) {
  const router = useRouter()
  const [cobranca, setCobranca] = useState<CobrancaPixDTO | null>(null)
  const [pago, setPago] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Pix anterior venceu e o contador lotou: escolher de novo antes do Pix.
  const [semVaga, setSemVaga] = useState<{ mensagem: string; contadores: ContadorParceiroPublico[] } | null>(null)
  const [enviando, iniciarEnvio] = useTransition()

  function aplicar(resposta: ResultadoPixPlano) {
    if (resposta.situacao === 'cobranca') {
      setCobranca(resposta.cobranca)
      setErro(null)
      return
    }
    if (resposta.situacao === 'pago') {
      setPago(true)
      onPago?.()
      router.refresh()
      return
    }
    if (resposta.situacao === 'gerando') {
      setTimeout(gerar, 2000)
      return
    }
    if (resposta.situacao === 'contador_sem_vaga') {
      setCobranca(null)
      setSemVaga({ mensagem: resposta.mensagem, contadores: resposta.contadores })
      return
    }
    setErro(resposta.mensagem)
  }

  function gerar() {
    iniciarEnvio(async () => aplicar(await iniciarPagamentoDoPlano({ assinaturaId })))
  }

  const iniciado = useRef(false)
  useEffect(() => {
    if (!iniciarAutomaticamente || iniciado.current) return
    iniciado.current = true
    gerar()
    // Uma vez por montagem; `gerar` muda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciarAutomaticamente])

  useAcompanharCobranca({
    ativo: !pago && cobranca?.status === 'aguardando_pagamento',
    consultar: () => acompanharPagamentoDoPlano({ assinaturaId }),
    aoResponder: aplicar,
  })

  if (pago) {
    return (
      <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        {mensagemPago}
      </p>
    )
  }

  if (semVaga) {
    return (
      <EscolherOutroContador
        assinaturaId={assinaturaId}
        {...semVaga}
        onEscolhido={() => {
          setSemVaga(null)
          gerar()
        }}
      />
    )
  }

  if (!cobranca && !enviando) {
    return (
      <div className="mt-3 space-y-2">
        <Button type="button" className="w-full" onClick={gerar}>
          <QrCode className="size-4" aria-hidden />
          {rotuloBotao}
        </Button>
        {erro ? <p role="alert" className="text-xs font-medium text-destructive">{erro}</p> : null}
      </div>
    )
  }

  return (
    <div className="mt-3">
      <PainelPix cobranca={cobranca} gerando={enviando && !cobranca} erro={erro} onGerarNovamente={gerar} />
    </div>
  )
}

/**
 * O contador escolhido lotou depois que o Pix anterior venceu. O cliente
 * escolhe outro parceiro com vaga ou deixa a Vincis escolher; o servidor
 * confere tudo de novo e só então o Pix é gerado.
 */
function EscolherOutroContador({
  assinaturaId,
  mensagem,
  contadores,
  onEscolhido,
}: {
  assinaturaId: string
  mensagem: string
  contadores: ContadorParceiroPublico[]
  onEscolhido: () => void
}) {
  const [escolha, setEscolha] = useState<string>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  function confirmar() {
    iniciar(async () => {
      const resultado = await escolherContadorDoPlanoPendente({
        assinaturaId,
        contador: escolha === 'vincis' ? { escolha: 'vincis' } : { escolha: 'cliente', contadorId: escolha },
      })
      if (!resultado.sucesso) {
        setErro(resultado.mensagem)
        return
      }
      onEscolhido()
    })
  }

  return (
    <fieldset className="mt-3 space-y-2">
      <legend role="alert" className="mb-2 text-sm font-medium text-foreground">
        {mensagem}
      </legend>
      {contadores.map((contador) => (
        <label key={contador.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
          <input
            type="radio"
            name={`contador-${assinaturaId}`}
            value={contador.id}
            checked={escolha === contador.id}
            onChange={() => setEscolha(contador.id)}
            className="size-4 accent-primary"
          />
          <span>
            {contador.nome}
            {contador.cidade ? (
              <span className="text-muted-foreground">
                {' '}
                · {contador.cidade}
                {contador.estado ? `/${contador.estado}` : ''}
              </span>
            ) : null}
          </span>
        </label>
      ))}
      <label className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
        <input
          type="radio"
          name={`contador-${assinaturaId}`}
          value="vincis"
          checked={escolha === 'vincis'}
          onChange={() => setEscolha('vincis')}
          className="size-4 accent-primary"
        />
        {OPCAO_VINCIS_ESCOLHE}
      </label>
      {erro ? <p role="alert" className="text-xs font-medium text-destructive">{erro}</p> : null}
      <Button type="button" className="w-full" disabled={!escolha || salvando} onClick={confirmar}>
        <QrCode className="size-4" aria-hidden />
        {salvando ? 'Salvando…' : 'Continuar e gerar Pix'}
      </Button>
    </fieldset>
  )
}
