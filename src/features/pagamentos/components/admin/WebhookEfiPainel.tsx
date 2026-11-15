'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cadastrarWebhookEfiAction } from '../../actions/webhook-efi'
import type { SituacaoWebhookEfi } from '../../lib/webhook-efi-cadastro'

/**
 * Painel do webhook Pix da Efí. Mostra só o estado — nunca token, chave Pix ou
 * a URL cadastrada completa (ela contém o token).
 */

const DESCRICAO_CONFLITO = {
  vincis_token_diferente: 'O endereço é o da Vincis, mas com um token diferente do configurado no servidor.',
  vincis_formato_diferente: 'O endereço é o da Vincis, mas sem o parâmetro "ignorar" no formato esperado.',
  outro_endereco: 'O webhook aponta para outro endereço',
} as const

function dataHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function WebhookEfiPainel({ situacao, consultadoEm }: { situacao: SituacaoWebhookEfi; consultadoEm: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  const cadastrar = () =>
    iniciar(async () => {
      const resultado = await cadastrarWebhookEfiAction()
      if (resultado.sucesso) toast.success(resultado.mensagem)
      else toast.error(resultado.mensagem)
      router.refresh()
    })

  const { titulo, cor, detalhe } = (() => {
    switch (situacao.estado) {
      case 'cadastrado':
        return {
          titulo: 'Webhook cadastrado',
          cor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
          detalhe: `A Efí avisa a Vincis a cada Pix recebido. Cadastrado na Efí em ${dataHora(situacao.criacao)}.`,
        }
      case 'nao_cadastrado':
        return {
          titulo: 'Webhook não cadastrado',
          cor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
          detalhe: 'A chave Pix da Vincis ainda não tem webhook. Os pagamentos continuam sendo confirmados pela tela aberta e pela rotina diária, mas com atraso.',
        }
      case 'conflito':
        return {
          titulo: 'Outro webhook cadastrado',
          cor: 'bg-red-500/15 text-red-700 dark:text-red-300',
          detalhe: `${DESCRICAO_CONFLITO[situacao.comparacao.tipo]}${situacao.comparacao.tipo === 'outro_endereco' ? ` (${situacao.comparacao.dominio}).` : ''} Ele não será sobrescrito automaticamente. Cadastrado em ${dataHora(situacao.criacao)}.`,
        }
      case 'indisponivel':
        return { titulo: 'Indisponível neste ambiente', cor: 'bg-muted text-muted-foreground', detalhe: situacao.motivo }
      case 'erro':
        return { titulo: 'Não foi possível consultar a Efí', cor: 'bg-red-500/15 text-red-700 dark:text-red-300', detalhe: situacao.mensagem }
    }
  })()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integração Pix (Efí)</h1>
        <p className="text-sm text-muted-foreground">
          Webhook que a Efí usa para avisar a Vincis dos Pix recebidos. O aviso nunca confirma um pagamento sozinho:
          a Vincis sempre consulta a cobrança na Efí antes.
        </p>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', cor)}>{titulo}</span>
          <span className="ml-auto text-xs text-muted-foreground">Consultado em {dataHora(consultadoEm)}</span>
        </div>
        <p className="mt-3 text-sm">{detalhe}</p>

        <dl className="mt-4 grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Endereço</dt>
            <dd className="font-medium break-all">vincis.com.br/api/efi/webhook</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Proteção</dt>
            <dd className="font-medium">Token secreto + consulta autenticada da cobrança</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {situacao.estado === 'nao_cadastrado' ? (
            <Button onClick={cadastrar} disabled={pendente}>
              {pendente ? 'Cadastrando…' : 'Cadastrar webhook na Efí'}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => router.refresh()} disabled={pendente}>
            Consultar novamente
          </Button>
        </div>
      </section>
    </div>
  )
}
