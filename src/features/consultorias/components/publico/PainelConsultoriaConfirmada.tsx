'use client'

import { CalendarCheck, Clock, Hash, User, Video } from 'lucide-react'
import { ROTULO_MODALIDADE } from '../../constants/consultoria'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '../../lib/formato'

/**
 * A etapa 3 do modal: consultoria confirmada.
 *
 * O protocolo é o item mais importante desta tela — é o número que o Cliente
 * vai usar para falar do atendimento com qualquer pessoa da plataforma. Ele
 * aparece em destaque e com `break-all`, porque `#2026-0042` não pode empurrar
 * a caixa para fora da tela num aparelho de 320px.
 *
 * O que **não** está aqui: a referência do pagamento simulado e o assunto que o
 * Cliente escreveu. A primeira é dado de conciliação, não de comemoração; o
 * segundo já está dentro do Protocolo, que é onde o Profissional vai lê-lo.
 */

export type PainelConsultoriaConfirmadaProps = {
  nomeExibido: string
  data: string
  inicio: string
  fim: string
  duracaoMinutos: number
  valorCentavos: number
  protocolo: string
}

export function PainelConsultoriaConfirmada({
  nomeExibido,
  data,
  inicio,
  fim,
  duracaoMinutos,
  valorCentavos,
  protocolo,
}: PainelConsultoriaConfirmadaProps) {
  return (
    <div className="space-y-4">
      <div
        role="status"
        className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4"
      >
        <CalendarCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="min-w-0 space-y-1">
          <p className="text-base font-bold text-foreground">Consultoria agendada!</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            O profissional já foi avisado. O link da videochamada aparecerá no
            seu atendimento antes do horário combinado.
          </p>
        </div>
      </div>

      <dl className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <User aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Profissional</dt>
            <dd className="text-sm font-semibold text-foreground">{nomeExibido}</dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Video aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Modalidade</dt>
            <dd className="text-sm font-semibold text-foreground">
              {ROTULO_MODALIDADE.online}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CalendarCheck
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Data</dt>
            <dd className="text-sm font-semibold text-foreground">
              {dataPorExtensoComDiaDaSemana(data)}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Horário</dt>
            <dd className="text-sm font-semibold text-foreground">
              {inicio} às {fim}{' '}
              <span className="font-normal text-muted-foreground">
                · {duracaoPorExtenso(duracaoMinutos)}
              </span>
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-3 sm:col-span-2">
          <Hash aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Protocolo</dt>
            <dd className="break-all font-mono text-base font-bold text-foreground">
              {protocolo}
            </dd>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 sm:col-span-2">
          <span className="text-sm font-medium text-muted-foreground">Valor pago</span>
          <span className="text-base font-bold text-foreground">
            {formatarPreco(valorCentavos)}
          </span>
        </div>
      </dl>
    </div>
  )
}
