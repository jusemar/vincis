'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { CabecalhoSecao, Dado, Pilula, Superficie, type Tom } from '@/features/portal-cliente/components/ui/primitivos'
import { formatarCentavos } from '@/features/precificacao/lib/formato'
import { cancelarMeuPlano } from '../../actions/cancelar-plano'
import { ROTULO_PERIODICIDADE, ROTULO_STATUS_ASSINATURA, type Periodicidade } from '../../constants/assinatura'
import {
  AVISO_PIX_PENDENTE,
  AVISOS_CANCELAMENTO_CLIENTE,
  formatarDataCancelamento,
} from '../../constants/cancelamento'
import {
  ROTULO_SITUACAO_FINANCEIRA,
  ROTULO_SITUACAO_MENSALIDADE,
  formatarDataLocal,
  formatarPeriodoCurto,
  type SituacaoFinanceiraDoPlano,
  type SituacaoMensalidade,
} from '../../constants/mensalidade'
import type { PlanoDoCliente } from '../../queries/planos-do-cliente'
import { PagamentoPixDoPlano } from './PagamentoPixDoPlano'

const TOM_DO_STATUS = {
  ativa: 'sucesso',
  aguardando_pagamento: 'atencao',
  cancelada: 'neutro',
  encerrada: 'neutro',
} as const

const TOM_FINANCEIRO: Record<SituacaoFinanceiraDoPlano, Tom> = {
  em_dia: 'sucesso',
  aguardando_pagamento: 'atencao',
  em_atraso: 'perigo',
}

const TOM_MENSALIDADE: Record<SituacaoMensalidade, Tom> = {
  paga: 'sucesso',
  aguardando_pagamento: 'atencao',
  em_atraso: 'perigo',
  cancelada: 'neutro',
}

/**
 * "Meus planos" do cliente: os planos contábeis da Vincis, com a situação, o
 * contador responsável e — discretamente — "Cancelar plano".
 *
 * O cancelamento exige confirmação explícita e é decidido no servidor; a tela
 * só mostra o que ele devolve.
 */
export function MeusPlanosCliente({ planos }: { planos: PlanoDoCliente[] }) {
  if (!planos.length) return null
  return (
    <section className="space-y-4">
      <CabecalhoSecao
        contexto="Planos"
        titulo="Meus planos"
        descricao="Os planos de contabilidade que você contratou da Vincis."
      />
      <ul className="space-y-3">
        {planos.map((plano) => (
          <li key={plano.id}>
            <CartaoPlano plano={plano} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CartaoPlano({ plano }: { plano: PlanoDoCliente }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, iniciar] = useTransition()
  const vigente = plano.status === 'ativa' || plano.status === 'aguardando_pagamento'
  const periodicidade = ROTULO_PERIODICIDADE[plano.periodicidade as Periodicidade] ?? plano.periodicidade

  function cancelar() {
    iniciar(async () => {
      const resultado = await cancelarMeuPlano({ assinaturaId: plano.id })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setConfirmando(false)
      router.refresh()
    })
  }

  return (
    <Superficie className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {plano.planoNome} · {periodicidade}
        </p>
        <Pilula
          rotulo={plano.status === 'cancelada' ? 'Plano cancelado' : ROTULO_STATUS_ASSINATURA[plano.status]}
          tom={TOM_DO_STATUS[plano.status]}
        />
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <Dado rotulo="Valor mensal" valor={formatarCentavos(plano.valorMensalCentavos)} />
        <Dado rotulo="Contador responsável" valor={plano.contador ?? 'A Vincis vai escolher'} />
        <Dado
          rotulo={plano.canceladoEm ? 'Cancelado em' : 'Contratado em'}
          valor={formatarDataCancelamento(plano.canceladoEm ?? plano.contratadoEm)}
        />
      </dl>

      {plano.status === 'aguardando_pagamento' ? (
        <PagamentoPixDoPlano assinaturaId={plano.id} onPago={() => router.refresh()} />
      ) : null}

      {plano.financeiro?.situacao ? (
        <Mensalidades plano={plano} financeiro={plano.financeiro} onPago={() => router.refresh()} />
      ) : null}

      {vigente ? (
        <div className="mt-4 flex justify-end">
          {/* Discreto de propósito: cancelar não é a ação principal da tela. */}
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmando(true)}>
            Cancelar plano
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmando} onOpenChange={(aberto) => !cancelando && setConfirmando(aberto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este plano?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-muted-foreground">
                <p>
                  {plano.planoNome} · {periodicidade}
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {AVISOS_CANCELAMENTO_CLIENTE.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                  {plano.status === 'aguardando_pagamento' ? <li>{AVISO_PIX_PENDENTE}</li> : null}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Manter plano</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={cancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Superficie>
  )
}

/**
 * As mensalidades do plano mensal ativo.
 *
 * "Plano ativo" (lá em cima) e "mensalidade em dia" (aqui) são coisas
 * diferentes: com um mês em aberto o plano continua cadastrado, com o mesmo
 * contador — só há um pagamento pendente. O botão aparece só quando existe
 * valor devido; o servidor decide qual mês e quanto, e recusa mês já pago.
 */
function Mensalidades({
  plano,
  financeiro,
  onPago,
}: {
  plano: PlanoDoCliente
  financeiro: NonNullable<PlanoDoCliente['financeiro']>
  onPago: () => void
}) {
  const situacao = financeiro.situacao!
  const devida = financeiro.devida
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Mensalidade</p>
        <Pilula rotulo={ROTULO_SITUACAO_FINANCEIRA[situacao]} tom={TOM_FINANCEIRO[situacao]} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Dado
          rotulo="Período atual"
          valor={
            financeiro.atual ? formatarPeriodoCurto(financeiro.atual.periodoInicio, financeiro.atual.periodoFim) : '—'
          }
        />
        <Dado
          rotulo="Pagamento"
          valor={devida ? ROTULO_SITUACAO_MENSALIDADE[devida.situacao] : 'Em dia'}
        />
        <Dado
          rotulo={devida?.situacao === 'em_atraso' ? 'Venceu em' : 'Vencimento'}
          valor={devida ? formatarDataLocal(devida.vencimento) : '—'}
        />
      </dl>

      {devida ? (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Mensalidade de {formatarDataLocal(devida.periodoInicio)} a {formatarDataLocal(devida.periodoFim)} ·{' '}
            <span className="font-semibold text-foreground">{formatarCentavos(devida.valorCentavos - devida.pagoCentavos)}</span>
            {devida.situacao === 'em_atraso'
              ? '. Seu plano continua ativo; regularize para o contador seguir com este mês.'
              : null}
          </p>
          <PagamentoPixDoPlano
            assinaturaId={plano.id}
            onPago={onPago}
            rotuloBotao="Pagar mensalidade"
            mensagemPago="Mensalidade paga. Obrigado!"
          />
        </div>
      ) : null}

      {financeiro.historico.length ? (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
            Histórico de mensalidades
          </summary>
          <ul className="mt-2 divide-y divide-border/60 text-sm">
            {financeiro.historico.map((mes) => (
              <li key={mes.numero} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{formatarPeriodoCurto(mes.periodoInicio, mes.periodoFim)}</span>
                  <span className="text-muted-foreground"> · {formatarCentavos(mes.valorCentavos)}</span>
                </span>
                <Pilula rotulo={ROTULO_SITUACAO_MENSALIDADE[mes.situacao]} tom={TOM_MENSALIDADE[mes.situacao]} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
