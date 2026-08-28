'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  buscarAgendaParaRemarcacao,
  buscarHorariosParaRemarcacao,
  remarcarConsultoria,
} from '../../actions/ciclo'
import type { PapelDoCiclo } from '../../constants/ciclo'
import { dataPorExtensoComDiaDaSemana } from '../../lib/formato'
import { ROTULO_DIA_SEMANA } from '../../constants/consultoria'
import type { AgendaDoMesDTO } from '../../types/consultoria'
import type { ConsultoriaParaAcoes } from './AcoesDaConsultoria'
import { Moldura } from './AcoesDaConsultoria'

/**
 * Escolher o horário novo — pela mesma agenda de sempre.
 *
 * ## Por que não há um segundo calendário
 *
 * Porque não há uma segunda agenda. Os dias e horários vêm das mesmas consultas
 * que desenham o calendário público do perfil: as mesmas faixas, as mesmas
 * exceções, a mesma antecedência mínima, o mesmo horizonte e a mesma folga
 * entre consultas. Um calendário paralelo aqui começaria igual e envelheceria
 * diferente — e ofereceria horários que a contratação recusa.
 *
 * A única diferença é que a própria consultoria não conta como ocupação; sem
 * isso, mover as 14:00 para as 14:30 esbarraria no compromisso que está sendo
 * movido. Quem cuida disso é o servidor, não esta tela.
 *
 * ## Confirmar não é escolher
 *
 * O horário selecionado aqui é uma intenção. Quem decide é o servidor, no
 * clique de confirmar, dentro da mesma transação que a reserva usa — e se
 * alguém tiver levado o horário nesse meio tempo, a consultoria continua
 * exatamente onde estava.
 */

const NOMES_DOS_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function ModalRemarcarConsultoria({
  consultoria,
  papel,
  aoFechar,
}: {
  consultoria: ConsultoriaParaAcoes
  papel: PapelDoCiclo
  aoFechar: () => void
}) {
  const router = useRouter()
  const [ano, setAno] = useState(() => Number(consultoria.data.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(consultoria.data.slice(5, 7)))
  /**
   * O mês carregado vem carimbado com qual mês ele é.
   *
   * Assim "ainda não chegou" é uma comparação feita no render — o carimbo bate
   * com o mês pedido? — em vez de um `setState(null)` disparado dentro do
   * efeito. O resultado na tela é o mesmo e não há um instante em que a agenda
   * de agosto apareça sob o título de setembro.
   */
  const [carregado, setCarregado] = useState<
    { ano: number; mes: number; agenda: AgendaDoMesDTO } | null
  >(null)
  const [dia, setDia] = useState<string | null>(null)
  const [horarios, setHorarios] = useState<{ inicio: string; fim: string }[]>([])
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [carregandoDia, setCarregandoDia] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  // O mês é um sistema externo (o servidor): o `setState` acontece no retorno
  // da promessa, e não no corpo do efeito.
  useEffect(() => {
    let vivo = true
    void buscarAgendaParaRemarcacao({ agendamentoId: consultoria.id, ano, mes }).then(
      (resposta) => {
        if (vivo) setCarregado({ ano, mes, agenda: resposta })
      },
    )
    return () => {
      vivo = false
    }
  }, [consultoria.id, ano, mes])

  const agenda =
    carregado && carregado.ano === ano && carregado.mes === mes
      ? carregado.agenda
      : null

  function abrirDia(data: string) {
    setDia(data)
    setEscolhido(null)
    setCarregandoDia(true)
    void buscarHorariosParaRemarcacao({ agendamentoId: consultoria.id, data }).then(
      (resposta) => {
        setHorarios(resposta.horarios)
        setCarregandoDia(false)
      },
    )
  }

  function confirmar() {
    if (!dia || !escolhido) return
    setErro(null)
    iniciar(async () => {
      const r = await remarcarConsultoria({
        agendamentoId: consultoria.id,
        data: dia,
        inicio: escolhido,
      })
      if (r.situacao === 'remarcada') {
        aoFechar()
        router.refresh()
        return
      }
      setErro('mensagem' in r ? r.mensagem : null)
      // O horário pode ter sido levado por outra pessoa: recarrega o dia para a
      // tela parar de oferecer o que já não existe.
      if (r.situacao === 'horario_indisponivel' && dia) abrirDia(dia)
    })
  }

  const diasDisponiveis = new Set(
    (agenda?.dias ?? []).filter((d) => d.totalSlots > 0).map((d) => d.data),
  )

  function mudarMes(passo: number) {
    const proximo = new Date(Date.UTC(ano, mes - 1 + passo, 1))
    setAno(proximo.getUTCFullYear())
    setMes(proximo.getUTCMonth() + 1)
    setDia(null)
    setEscolhido(null)
    setHorarios([])
  }

  return (
    <Moldura titulo="Remarcar consultoria" aoFechar={aoFechar} ocupado={enviando}>
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">Horário atual: </span>
        <span className="font-medium">
          {dataPorExtensoComDiaDaSemana(consultoria.data)} · {consultoria.inicio} às{' '}
          {consultoria.fim}
        </span>
      </p>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">
            {NOMES_DOS_MESES[mes - 1]} {ano}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
              className="rounded-lg p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
              className="rounded-lg p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {!agenda ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Carregando a agenda…
          </p>
        ) : diasDisponiveis.size === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum horário livre neste mês. Tente o mês seguinte.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(agenda.dias ?? [])
              .filter((d) => d.totalSlots > 0)
              .map((d) => {
                const numero = Number(d.data.slice(8, 10))
                const semana = ROTULO_DIA_SEMANA[new Date(`${d.data}T12:00:00Z`).getUTCDay()]
                return (
                  <button
                    key={d.data}
                    type="button"
                    aria-pressed={dia === d.data}
                    onClick={() => abrirDia(d.data)}
                    className={`min-w-[3.25rem] rounded-lg border px-2 py-1.5 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      dia === d.data
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <span className="block text-[0.65rem] opacity-70">{semana}</span>
                    <span className="block font-semibold">{numero}</span>
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {dia ? (
        <div>
          <p className="mb-2 text-sm font-semibold">
            {dataPorExtensoComDiaDaSemana(dia)}
          </p>
          {carregandoDia ? (
            <p className="text-sm text-muted-foreground">Carregando horários…</p>
          ) : horarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este dia ficou sem horários livres. Escolha outro.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {horarios.map((h) => {
                /*
                  O horário atual aparece — a pessoa precisa se localizar —, mas
                  não é escolhível: confirmá-lo geraria um evento, um aviso e um
                  contador a mais para um compromisso que não mudou de lugar.
                */
                const ehOAtual =
                  dia === consultoria.data && h.inicio === consultoria.inicio
                return (
                  <button
                    key={h.inicio}
                    type="button"
                    aria-pressed={escolhido === h.inicio}
                    disabled={ehOAtual}
                    title={ehOAtual ? 'Este já é o horário da consultoria.' : undefined}
                    onClick={() => setEscolhido(h.inicio)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      ehOAtual
                        ? 'cursor-not-allowed border-dashed border-border text-muted-foreground'
                        : escolhido === h.inicio
                          ? 'border-primary bg-primary font-semibold text-primary-foreground'
                          : 'border-border hover:bg-muted'
                    }`}
                  >
                    {h.inicio}
                    {ehOAtual ? <span className="ml-1 text-xs">(atual)</span> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      {papel === 'prestador' ? (
        <p className="text-xs text-muted-foreground">
          O cliente será avisado do novo horário.
        </p>
      ) : null}

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
          disabled={enviando || !escolhido}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Confirmar novo horário
        </button>
      </div>
    </Moldura>
  )
}
