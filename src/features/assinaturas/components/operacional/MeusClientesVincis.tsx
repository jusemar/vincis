import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock, Lock, ShieldCheck, UserRound } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ROTULO_STATUS_COBRANCA } from '@/features/pagamentos/constants/cobranca'
import { cn } from '@/lib/utils'
import { ROTULO_PERIODICIDADE, ROTULO_STATUS_ASSINATURA, type Periodicidade } from '../../constants/assinatura'
import {
  ROTULO_ESCOLHA_CONTADOR,
  ROTULO_MEUS_CLIENTES_VINCIS,
  ROTULO_SITUACAO_OPERACIONAL,
  rotuloDaCapacidade,
  type Ocupacao,
} from '../../constants/contador-responsavel'
import {
  ROTULO_SITUACAO_FINANCEIRA,
  formatarDataLocal,
  formatarPeriodoCurto,
  type SituacaoFinanceiraDoPlano,
} from '../../constants/mensalidade'
import type { ClienteVincisDoContador } from '../../queries/carteira-do-contador'

/** Cor e ícone da situação da mensalidade — o texto sempre acompanha a cor. */
const ESTILO_FINANCEIRO: Record<SituacaoFinanceiraDoPlano, { classe: string; Icone: typeof CheckCircle2 }> = {
  em_dia: { classe: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200', Icone: CheckCircle2 },
  aguardando_pagamento: { classe: 'bg-amber-500/15 text-amber-800 dark:text-amber-200', Icone: Clock },
  em_atraso: { classe: 'bg-red-500/15 text-red-800 dark:text-red-200', Icone: AlertTriangle },
}

function data(iso: string | null) {
  return iso ? new Intl.DateTimeFormat('pt-BR').format(new Date(iso)) : '—'
}

/**
 * "Meus clientes Vincis": planos recorrentes da Vincis dos quais este contador
 * parceiro é hoje o responsável.
 *
 * Só leitura. Enquanto o pagamento não é confirmado o item aparece com
 * "Aguardando confirmação do pagamento" e sem ação de prestação; a confirmação
 * da Efí ativa o plano e a situação muda sozinha para "Atendimento liberado".
 */
export function MeusClientesVincis({
  clientes,
  capacidade,
  ocupacao,
}: {
  clientes: ClienteVincisDoContador[]
  capacidade: number | null
  ocupacao: Ocupacao
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">{ROTULO_MEUS_CLIENTES_VINCIS}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Clientes que contrataram um plano da Vincis e têm você como contador responsável.
          </p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {rotuloDaCapacidade(capacidade, ocupacao)}
        </span>
      </header>

      {clientes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum cliente Vincis atribuído a você no momento. Quando um cliente escolher você ou a Vincis alocar um
            plano, ele aparece aqui.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {clientes.map((cliente) => (
            <li key={cliente.assinaturaId}>
              <CartaoCliente cliente={cliente} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CartaoCliente({ cliente }: { cliente: ClienteVincisDoContador }) {
  const liberada = cliente.situacao === 'liberada'
  const pixVencido = cliente.ultimaCobranca === 'expirada' || cliente.ultimaCobranca === 'cancelada'
  const periodicidade = ROTULO_PERIODICIDADE[cliente.periodicidade as Periodicidade] ?? cliente.periodicidade

  return (
    <Card className="h-full py-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 font-semibold">
            <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{cliente.cliente}</span>
          </p>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              liberada
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
            )}
          >
            {liberada ? <ShieldCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
            {ROTULO_SITUACAO_OPERACIONAL[cliente.situacao]}
          </span>
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Plano</dt>
            <dd>
              {cliente.planoNome} · {periodicidade}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Empresa</dt>
            <dd className="flex items-center gap-1">
              <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
              {cliente.empresa ?? 'Não informada'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Contratado em</dt>
            <dd className="flex items-center gap-1">
              <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
              {data(cliente.contratadoEm)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pagamento</dt>
            <dd>
              {liberada
                ? `Confirmado · início ${data(cliente.vigenciaInicio)}`
                : pixVencido && cliente.ultimaCobranca
                  ? `${ROTULO_STATUS_COBRANCA[cliente.ultimaCobranca]} · vaga liberada`
                  : ROTULO_STATUS_ASSINATURA[cliente.statusPlano]}
            </dd>
          </div>
        </dl>

        {cliente.financeiro?.situacao ? <MensalidadeDoCliente financeiro={cliente.financeiro} /> : null}

        {liberada ? null : (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Você já pode ver esta contratação, mas a prestação só começa depois que o pagamento for confirmado. A
            liberação é automática.
          </p>
        )}

        {cliente.escolhaContador ? (
          <p className="text-xs text-muted-foreground">{ROTULO_ESCOLHA_CONTADOR[cliente.escolhaContador]}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * A mensalidade do cliente, do ponto de vista do contador: o mês em curso e se
 * o dinheiro dele (ou de um mês anterior) está em dia, aguardando ou em atraso.
 *
 * Só informa. Atraso não tira o cliente da carteira nem libera a vaga; o mês
 * em aberto apenas não pode ser dado como prestado até ser pago.
 */
function MensalidadeDoCliente({
  financeiro,
}: {
  financeiro: NonNullable<ClienteVincisDoContador['financeiro']>
}) {
  const situacao = financeiro.situacao!
  const { classe, Icone } = ESTILO_FINANCEIRO[situacao]
  const devida = financeiro.devida
  return (
    <div className="space-y-1.5 rounded-lg border p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">
          Mês atual:{' '}
          <span className="font-medium text-foreground">
            {financeiro.atual
              ? `${formatarPeriodoCurto(financeiro.atual.periodoInicio, financeiro.atual.periodoFim)}`
              : '—'}
          </span>
        </span>
        <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', classe)}>
          <Icone className="size-3.5" aria-hidden />
          {ROTULO_SITUACAO_FINANCEIRA[situacao]}
        </span>
      </div>
      {devida ? (
        <p className="text-muted-foreground">
          Mensalidade {formatarPeriodoCurto(devida.periodoInicio, devida.periodoFim)} ·{' '}
          {situacao === 'em_atraso' ? 'venceu em' : 'vence em'} {formatarDataLocal(devida.vencimento)}. A prestação
          desse mês só pode ser concluída depois do pagamento.
        </p>
      ) : null}
    </div>
  )
}
