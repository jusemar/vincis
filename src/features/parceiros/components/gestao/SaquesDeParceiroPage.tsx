'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Briefcase, Wallet, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Pilula } from '@/features/portal-cliente/components/ui/primitivos'
import { marcarSaquePago } from '../../actions/marcar-saque-pago'
import { recusarSaque } from '../../actions/recusar-saque'
import { ROTULO_SAQUE, TOM_SAQUE } from '../../constants/saque'
import type { SaqueParaGestao } from '../../queries/listar-saques-gestao'

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const reais = (centavos: number) => MOEDA.format(centavos / 100)

/**
 * Um saque, com a origem de cada centavo.
 *
 * As comissões aparecem abertas, e não resumidas num total, porque é sobre
 * elas que a conferência acontece: o Gestor vai transferir dinheiro por fora e
 * precisa saber de qual serviço e de qual cliente veio cada parte. Um número
 * agregado obrigaria a confiar na soma.
 */
function CartaoDeSaque({ saque }: { saque: SaqueParaGestao }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [recusaAberta, setRecusaAberta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [registrando, iniciarTransicao] = useTransition()
  const pendente = saque.status === 'solicitado'

  function confirmar() {
    iniciarTransicao(async () => {
      const resultado = await marcarSaquePago({ saqueId: saque.id })
      if (resultado.sucesso) {
        toast.success(resultado.mensagem)
        setAberto(false)
        router.refresh()
      } else {
        toast.error(resultado.mensagem)
      }
    })
  }

  function confirmarRecusa() {
    iniciarTransicao(async () => {
      const resultado = await recusarSaque({ saqueId: saque.id, motivo })
      if (resultado.sucesso) {
        toast.success(resultado.mensagem)
        setRecusaAberta(false)
        setMotivo('')
        router.refresh()
      } else {
        toast.error(resultado.mensagem)
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="font-serif text-xl font-semibold tabular-nums">
              {reais(saque.valorCentavos)}
            </p>
            <p className="mt-0.5 text-sm">
              {saque.parceiroNome}{' '}
              <span className="font-mono text-xs text-muted-foreground">
                · {saque.parceiroCodigo}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{saque.parceiroEmail}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Pilula
              rotulo={ROTULO_SAQUE[saque.status]}
              tom={TOM_SAQUE[saque.status]}
            />
            <p className="text-xs tabular-nums text-muted-foreground">
              Solicitado {QUANDO.format(saque.solicitadoEm)}
            </p>
            {saque.pagoEm ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                Pago {QUANDO.format(saque.pagoEm)}
              </p>
            ) : null}
            {saque.recusadoEm ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                Recusado {QUANDO.format(saque.recusadoEm)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border-t pt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Origem do valor · {saque.origens.length} comissão(ões)
          </p>
          <ul className="mt-2 space-y-1.5">
            {saque.origens.map((origem) => (
              <li
                key={origem.comissaoId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Briefcase
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">
                    {origem.servico ?? 'Serviço'}
                    <span className="text-muted-foreground">
                      {' '}
                      · {origem.clienteNome}
                    </span>
                  </span>
                </span>
                <span className="tabular-nums">{reais(origem.valorCentavos)}</span>
              </li>
            ))}
          </ul>
        </div>

        {saque.observacao ? (
          <p className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Motivo:</span>{' '}
            {saque.observacao}
          </p>
        ) : null}

        {pendente ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {/*
              O aviso é a regra: a Vincis não transfere dinheiro. Sem esta
              frase, "Marcar como pago" parece um botão que paga.
            */}
            <p className="text-xs text-muted-foreground">
              Faça a transferência pelo seu banco e registre aqui depois.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setRecusaAberta(true)}
              >
                <XCircle className="size-4" aria-hidden />
                Recusar
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setAberto(true)}>
                <Banknote className="size-4" aria-hidden />
                Marcar como pago
              </Button>
            </div>
          </div>
        ) : null}

        <AlertDialog open={aberto} onOpenChange={setAberto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Registrar o pagamento de {reais(saque.valorCentavos)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Confirme apenas depois de ter transferido o valor a{' '}
                {saque.parceiroNome} pelo seu banco. A Vincis não envia dinheiro
                — este registro marca o saque como pago e quita as{' '}
                {saque.origens.length} comissão(ões) que o compõem.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={registrando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(evento) => {
                  // O diálogo fecha sozinho no clique; aqui ele espera a ação
                  // responder, para o Gestor ver o erro se houver um.
                  evento.preventDefault()
                  confirmar()
                }}
                disabled={registrando}
              >
                {registrando ? 'Registrando…' : 'Confirmar pagamento'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={recusaAberta} onOpenChange={setRecusaAberta}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Recusar o saque de {reais(saque.valorCentavos)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                O pedido é encerrado sem pagamento e{' '}
                {reais(saque.valorCentavos)} voltam ao saldo de{' '}
                {saque.parceiroNome}, que poderá solicitar de novo. As{' '}
                {saque.origens.length} comissão(ões) continuam válidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`motivo-${saque.id}`}>Motivo (opcional)</Label>
              <Textarea
                id={`motivo-${saque.id}`}
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Fica registrado no histórico administrativo."
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={registrando}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(evento) => {
                  evento.preventDefault()
                  confirmarRecusa()
                }}
                disabled={registrando}
              >
                {registrando ? 'Recusando…' : 'Confirmar recusa'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

/**
 * Saques dos parceiros, na Gestão Vincis.
 *
 * ## O que esta tela faz
 *
 * Mostra o que foi pedido e registra o que foi pago. O pagamento em si
 * acontece fora: o Gestor transfere pelo banco dele e volta para marcar. A
 * plataforma controla o estado financeiro, não o dinheiro.
 *
 * ## O que ela não mostra
 *
 * Chave Pix, conta ou qualquer dado bancário — a Vincis não guarda nenhum, e
 * exibir um campo vazio sugeriria que guarda. O canal de pagamento é o que o
 * Gestor já usa com aquele parceiro.
 */
export function SaquesDeParceiroPage({ saques }: { saques: SaqueParaGestao[] }) {
  const pendentes = saques.filter((saque) => saque.status === 'solicitado')
  const aPagar = pendentes.reduce((total, saque) => total + saque.valorCentavos, 0)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Saques dos parceiros
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O pagamento é feito por fora, no seu banco. Aqui você registra o que
            já pagou.
          </p>
        </div>
        {pendentes.length ? (
          <p className="flex items-center gap-2 text-sm">
            <Wallet className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-serif font-semibold tabular-nums">
              {reais(aPagar)}
            </span>
            <span className="text-muted-foreground">
              em {pendentes.length} solicitação(ões)
            </span>
          </p>
        ) : null}
      </div>

      {saques.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum saque solicitado até agora.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {saques.map((saque) => (
            <CartaoDeSaque key={saque.id} saque={saque} />
          ))}
        </div>
      )}
    </section>
  )
}
