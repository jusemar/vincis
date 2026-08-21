'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, CreditCard, ExternalLink, Handshake, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dado,
  Pilula,
} from '@/features/portal-cliente/components/ui/primitivos'
import { aceitarProposta, criarContraproposta } from '../../actions/negociacao'
import { LIMITE_MENSAGEM_CONTRAPROPOSTA } from '../../constants/oportunidade'
import type { PropostaRecebidaDTO } from '../../types/oportunidade'
import { formatarDataHora, formatarValor } from '../compartilhado/formato'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}

/**
 * Uma proposta recebida, do ponto de vista do Cliente.
 *
 * Três blocos na ordem em que a decisão acontece: **quem** propôs (cartão
 * público real, resolvido pela plataforma), **o que** foi proposto (valor,
 * prazo, validade) e **o que dá para fazer agora**. A negociação aparece como
 * uma trilha curta de fatos datados — nunca como conversa: cada linha tem valor
 * e desfecho, e é isso que precisa ser lido de relance.
 *
 * As regras não mudaram com o redesenho: quem aceita é o dono da solicitação,
 * quem responde contraproposta é o autor da proposta, e o servidor continua
 * decidindo os dois.
 */
export function PropostaRecebida({
  proposta,
  oportunidadeAtiva,
  oportunidadeId,
  pago = false,
}: {
  proposta: PropostaRecebidaDTO
  oportunidadeAtiva: boolean
  /** Necessário para levar ao pagamento do acordo. */
  oportunidadeId: string
  /** O acordo já foi pago — então o que resta é o Atendimento, não o botão. */
  pago?: boolean
}) {
  const router = useRouter()
  const [contrapropondo, setContrapropondo] = useState(false)
  const [valor, setValor] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [processando, iniciarTransicao] = useTransition()

  const aceita = proposta.status === 'aceita'
  const podeAgir =
    oportunidadeAtiva && proposta.vigente && !proposta.contrapropostaPendente

  function aceitar() {
    iniciarTransicao(async () => {
      const resultado = await aceitarProposta({ propostaId: proposta.id })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      router.refresh()
    })
  }

  function enviarContraproposta(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await criarContraproposta({
        propostaId: proposta.id,
        valor,
        mensagem,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setContrapropondo(false)
      setValor('')
      setMensagem('')
      router.refresh()
    })
  }

  return (
    <li className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {proposta.perfilPublico.avatarUrl ? (
            <img
              src={proposta.perfilPublico.avatarUrl}
              alt=""
              className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              {iniciais(proposta.perfilPublico.nome)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {proposta.perfilPublico.nome}
            </p>
            {proposta.perfilPublico.destaque ? (
              <p className="truncate text-xs text-muted-foreground">
                {proposta.perfilPublico.destaque}
              </p>
            ) : null}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                {/* Sem avaliação não é nota zero: o traço não inventa reputação. */}
                {proposta.perfilPublico.avaliacaoMedia != null
                  ? proposta.perfilPublico.avaliacaoMedia
                      .toFixed(1)
                      .replace('.', ',')
                  : '—'}
              </span>
              <span>({proposta.perfilPublico.totalAvaliacoes})</span>
              {proposta.prestadorCidade ? (
                <span>
                  · {proposta.prestadorCidade}/{proposta.prestadorEstado}
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {aceita ? (
          <Pilula
            rotulo={pago ? 'Pagamento aprovado' : 'Aguardando pagamento'}
            tom={pago ? 'sucesso' : 'atencao'}
          />
        ) : !proposta.vigente ? (
          <Pilula rotulo="Fora da validade" tom="neutro" />
        ) : proposta.contrapropostaPendente ? (
          <Pilula rotulo="Aguardando profissional" tom="atencao" />
        ) : (
          <Pilula rotulo="Aguardando você" tom="destaque" />
        )}
      </div>

      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {proposta.mensagem}
      </p>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Dado
          rotulo="Valor"
          valor={
            <span className="text-base font-semibold text-primary">
              {formatarValor(proposta.valorCentavos, 'A combinar')}
            </span>
          }
        />
        <Dado
          rotulo="Prazo de execução"
          valor={
            proposta.prazoEstimadoDias != null
              ? `${proposta.prazoEstimadoDias} dias`
              : 'A combinar'
          }
        />
        <Dado
          rotulo={proposta.vigente ? 'Válida até' : 'Validade encerrada'}
          valor={proposta.validaAte ? formatarDataHora(proposta.validaAte) : '—'}
        />
      </dl>

      {aceita ? (
        <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 p-3">
          <p className="flex items-center gap-2 text-sm text-success">
            <Handshake className="size-4 shrink-0" aria-hidden />
            Acordo fechado em {formatarDataHora(proposta.aceitaEm)} por{' '}
            {formatarValor(
              proposta.valorAcordadoCentavos ?? proposta.valorCentavos,
              'valor a combinar',
            )}
            .
          </p>
          {/* O acordo combina o preço; a contratação só se efetiva com o
              pagamento, e é ele que abre o atendimento. Dizer isso aqui evita
              que o Cliente ache que já terminou. */}
          {!pago ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm">
                <Link href={`/cliente?aba=orcamentos&pagar=${oportunidadeId}`}>
                  <CreditCard className="size-4" />
                  Pagar
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                O atendimento é aberto após a confirmação do pagamento.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {(proposta.contrapropostaPendente ||
        proposta.historicoContrapropostas.length > 0) && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Negociação
          </p>
          <ol className="mt-2 space-y-1.5 text-xs">
            {proposta.historicoContrapropostas.map((rodada) => (
              <li key={rodada.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">
                  Você propôs {formatarValor(rodada.valorCentavos)}
                </span>
                <span className="text-muted-foreground">
                  · {rodada.status === 'aceita' ? 'aceita' : 'recusada'} em{' '}
                  {formatarDataHora(rodada.respondidaEm)}
                </span>
              </li>
            ))}
            {proposta.contrapropostaPendente ? (
              <li className="flex flex-wrap gap-x-2">
                <span className="font-medium">
                  Você propôs{' '}
                  {formatarValor(proposta.contrapropostaPendente.valorCentavos)}
                </span>
                <span className="text-muted-foreground">
                  · aguardando resposta desde{' '}
                  {formatarDataHora(proposta.contrapropostaPendente.criadoEm)}
                </span>
              </li>
            ) : null}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={proposta.perfilPublico.perfilUrl}>
            <ExternalLink className="size-3.5" />
            Ver perfil
          </Link>
        </Button>
        {podeAgir && !aceita ? (
          <>
            <Button size="sm" onClick={aceitar} disabled={processando}>
              <CheckCircle2 className="size-4" />
              Aceitar proposta
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContrapropondo((atual) => !atual)}
              disabled={processando}
            >
              Fazer contraproposta
            </Button>
          </>
        ) : null}
      </div>

      {contrapropondo && podeAgir ? (
        <form
          className="grid gap-3 rounded-lg border p-4 sm:max-w-md"
          onSubmit={enviarContraproposta}
        >
          <div className="space-y-1.5">
            <Label
              htmlFor={`contraproposta-valor-${proposta.id}`}
              className="text-xs"
            >
              Valor que você propõe
            </Label>
            <Input
              id={`contraproposta-valor-${proposta.id}`}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="700,00"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`contraproposta-mensagem-${proposta.id}`}
              className="text-xs"
            >
              Mensagem (opcional)
            </Label>
            <Textarea
              id={`contraproposta-mensagem-${proposta.id}`}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              maxLength={LIMITE_MENSAGEM_CONTRAPROPOSTA}
              rows={2}
              placeholder="Explique brevemente o valor proposto."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContrapropondo(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={processando}>
              {processando ? 'Enviando...' : 'Enviar contraproposta'}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
