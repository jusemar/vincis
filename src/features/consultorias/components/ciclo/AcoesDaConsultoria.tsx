'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CalendarClock, Loader2, X } from 'lucide-react'
import { cancelarConsultoria, concluirConsultoria } from '../../actions/ciclo'
import {
  ACAO_CANCELAR,
  ACAO_CONCLUIR,
  ACAO_REMARCAR,
  AVISO_DA_CONCLUSAO,
  AVISO_HORARIO_LIBERADO,
  AVISO_PAGAMENTO_NO_CANCELAMENTO,
  LIMITE_MOTIVO_CANCELAMENTO,
  MENSAGEM_MOTIVO_OBRIGATORIO,
  MENSAGEM_PRAZO_POR_PAPEL,
  type PapelDoCiclo,
} from '../../constants/ciclo'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '../../lib/formato'
import { ModalRemarcarConsultoria } from './ModalRemarcarConsultoria'

/**
 * Cancelar e remarcar — os mesmos dois botões dos dois lados da consultoria.
 *
 * ## Por que um componente só
 *
 * Porque a regra é uma só. O que muda entre o Cliente e o Profissional é o
 * prazo e a obrigatoriedade do motivo, e as duas coisas são **dados**: entram
 * como `papel`. Duas telas parecidas viram duas regras parecidas, e duas regras
 * parecidas divergem no primeiro ajuste — foi o que a Etapa 8 evitou fazendo o
 * painel da videochamada ser um só.
 *
 * ## O botão não é a autorização
 *
 * `podeAlterar` vem do servidor e serve para desenhar. A recusa de verdade
 * acontece na ação, a cada clique, com o relógio do servidor. Uma aba deixada
 * aberta a tarde inteira mostra os botões e leva `fora_do_prazo` ao clicar — é
 * exatamente o que deve acontecer.
 */

export type ConsultoriaParaAcoes = {
  id: string
  data: string
  inicio: string
  fim: string
  timezone: string
  duracaoMinutos: number
  valorCentavos: number
  status: string
  protocolo: string | null
  podeAlterar: boolean
  /**
   * Só o Profissional, e só depois do término. Vem calculado do servidor — a
   * ação recheca no clique, com o relógio dela.
   */
  podeConcluir?: boolean
  /** Quem está do outro lado — só para a pessoa reconhecer o compromisso. */
  outraParte: string
}

export function AcoesDaConsultoria({
  consultoria,
  papel,
  compacto = false,
}: {
  consultoria: ConsultoriaParaAcoes
  papel: PapelDoCiclo
  /** Na lista, os botões são discretos; no destaque, são botões inteiros. */
  compacto?: boolean
}) {
  const [cancelando, setCancelando] = useState(false)
  const [remarcando, setRemarcando] = useState(false)
  const [concluindo, setConcluindo] = useState(false)

  // Desfeita ou já concluída: o ciclo acabou, e nenhum destes botões faz
  // sentido. Deixá-los desabilitados sugeriria que ainda há algo a decidir.
  if (consultoria.status === 'cancelada' || consultoria.status === 'concluida') {
    return null
  }

  /**
   * Depois do término, a única ação é concluir.
   *
   * Remarcar e cancelar já não são possíveis (o prazo dos dois acabou no
   * início), e mostrá-los desabilitados ao lado do botão que interessa só
   * dispersaria a atenção de quem acabou de sair da consulta.
   */
  if (consultoria.podeConcluir) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConcluindo(true)}
          className={`${compacto ? 'rounded-lg px-2.5 py-1.5 text-xs font-semibold' : 'rounded-lg px-3.5 py-2 text-sm font-semibold'} bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {ACAO_CONCLUIR}
        </button>
        {concluindo ? (
          <ModalConcluir
            consultoria={consultoria}
            papel={papel}
            aoFechar={() => setConcluindo(false)}
          />
        ) : null}
      </>
    )
  }

  const base = compacto
    ? 'rounded-lg px-2.5 py-1.5 text-xs font-medium'
    : 'rounded-lg px-3.5 py-2 text-sm font-semibold'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRemarcando(true)}
          disabled={!consultoria.podeAlterar}
          title={consultoria.podeAlterar ? undefined : MENSAGEM_PRAZO_POR_PAPEL[papel]}
          className={`${base} border border-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {ACAO_REMARCAR}
        </button>
        <button
          type="button"
          onClick={() => setCancelando(true)}
          disabled={!consultoria.podeAlterar}
          title={consultoria.podeAlterar ? undefined : MENSAGEM_PRAZO_POR_PAPEL[papel]}
          className={`${base} text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {ACAO_CANCELAR}
        </button>
      </div>

      {!consultoria.podeAlterar ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {MENSAGEM_PRAZO_POR_PAPEL[papel]}
        </p>
      ) : null}

      {cancelando ? (
        <ModalCancelar
          consultoria={consultoria}
          papel={papel}
          aoFechar={() => setCancelando(false)}
        />
      ) : null}

      {remarcando ? (
        <ModalRemarcarConsultoria
          consultoria={consultoria}
          papel={papel}
          aoFechar={() => setRemarcando(false)}
        />
      ) : null}
    </>
  )
}

/**
 * A confirmação do cancelamento.
 *
 * Mostra o compromisso inteiro antes de desfazê-lo — profissional (ou cliente),
 * data, hora, duração, valor e protocolo. Não é enfeite: cancelar a consultoria
 * errada é um erro caro e irreversível para quem está do outro lado, e a única
 * defesa contra isso é a pessoa reconhecer o que está prestes a desfazer.
 */
function ModalCancelar({
  consultoria,
  papel,
  aoFechar,
}: {
  consultoria: ConsultoriaParaAcoes
  papel: PapelDoCiclo
  aoFechar: () => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const motivoObrigatorio = papel === 'prestador'
  const faltaMotivo = motivoObrigatorio && !motivo.trim()

  function confirmar() {
    if (faltaMotivo) {
      setErro(MENSAGEM_MOTIVO_OBRIGATORIO)
      return
    }
    setErro(null)
    iniciar(async () => {
      const r = await cancelarConsultoria({
        agendamentoId: consultoria.id,
        motivo: motivo.trim() || null,
      })
      if (r.situacao === 'cancelada') {
        aoFechar()
        router.refresh()
        return
      }
      setErro('mensagem' in r ? r.mensagem : null)
    })
  }

  return (
    <Moldura
      titulo="Cancelar consultoria"
      aoFechar={aoFechar}
      ocupado={enviando}
    >
      <dl className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <Linha rotulo={papel === 'cliente' ? 'Profissional' : 'Cliente'} valor={consultoria.outraParte} />
        <Linha rotulo="Data" valor={dataPorExtensoComDiaDaSemana(consultoria.data)} />
        <Linha rotulo="Horário" valor={`${consultoria.inicio} às ${consultoria.fim}`} />
        <Linha rotulo="Duração" valor={duracaoPorExtenso(consultoria.duracaoMinutos)} />
        <Linha rotulo="Valor" valor={formatarPreco(consultoria.valorCentavos)} />
        {consultoria.protocolo ? (
          <Linha rotulo="Protocolo" valor={consultoria.protocolo} mono />
        ) : null}
      </dl>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {AVISO_HORARIO_LIBERADO}
      </p>

      <div className="space-y-1.5">
        <label htmlFor="motivo-cancelamento" className="text-sm font-medium">
          Motivo{motivoObrigatorio ? '' : ' (opcional)'}
        </label>
        <textarea
          id="motivo-cancelamento"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value.slice(0, LIMITE_MOTIVO_CANCELAMENTO))}
          maxLength={LIMITE_MOTIVO_CANCELAMENTO}
          rows={3}
          placeholder={
            motivoObrigatorio
              ? 'Explique o que aconteceu. O cliente verá esta mensagem.'
              : 'Se quiser, conte o motivo para o profissional.'
          }
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-right text-xs text-muted-foreground">
          {motivo.length}/{LIMITE_MOTIVO_CANCELAMENTO}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">{AVISO_PAGAMENTO_NO_CANCELAMENTO}</p>

      {erro ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={aoFechar}
          disabled={enviando}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Confirmar cancelamento
        </button>
      </div>
    </Moldura>
  )
}

/**
 * A confirmação da conclusão.
 *
 * Diz o que a ação encerra e — mais importante — o que ela **não** apaga.
 * "Concluir" soa terminal, e quem clica precisa saber que o protocolo, o
 * histórico e o pagamento continuam onde estão.
 */
function ModalConcluir({
  consultoria,
  papel,
  aoFechar,
}: {
  consultoria: ConsultoriaParaAcoes
  papel: PapelDoCiclo
  aoFechar: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await concluirConsultoria({ agendamentoId: consultoria.id })
      if (r.situacao === 'concluida') {
        aoFechar()
        router.refresh()
        return
      }
      setErro('mensagem' in r ? r.mensagem : null)
    })
  }

  return (
    <Moldura titulo="Concluir consultoria" aoFechar={aoFechar} ocupado={enviando}>
      <dl className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <Linha rotulo={papel === 'cliente' ? 'Profissional' : 'Cliente'} valor={consultoria.outraParte} />
        <Linha rotulo="Data" valor={dataPorExtensoComDiaDaSemana(consultoria.data)} />
        <Linha rotulo="Horário" valor={`${consultoria.inicio} às ${consultoria.fim}`} />
        <Linha rotulo="Duração" valor={duracaoPorExtenso(consultoria.duracaoMinutos)} />
        {consultoria.protocolo ? (
          <Linha rotulo="Protocolo" valor={consultoria.protocolo} mono />
        ) : null}
      </dl>

      <p className="text-sm text-muted-foreground">{AVISO_DA_CONCLUSAO}</p>

      {erro ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={aoFechar}
          disabled={enviando}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Confirmar conclusão
        </button>
      </div>
    </Moldura>
  )
}

function Linha({
  rotulo,
  valor,
  mono = false,
}: {
  rotulo: string
  valor: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={mono ? 'font-mono font-semibold' : 'font-medium'}>{valor}</dd>
    </div>
  )
}

/**
 * A moldura comum dos dois modais do ciclo.
 *
 * `Escape` fecha, o foco começa no botão de fechar e o fundo não rola. São as
 * três coisas que um diálogo precisa fazer e que ninguém percebe até faltarem.
 */
export function Moldura({
  titulo,
  children,
  aoFechar,
  ocupado = false,
}: {
  titulo: string
  children: React.ReactNode
  aoFechar: () => void
  ocupado?: boolean
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!ocupado) aoFechar()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !ocupado) aoFechar()
      }}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            disabled={ocupado}
            aria-label="Fechar"
            autoFocus
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  )
}
