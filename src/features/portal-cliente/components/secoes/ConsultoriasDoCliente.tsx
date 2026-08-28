import Link from 'next/link'
import { ArrowRight, CalendarCheck, Clock, Video } from 'lucide-react'
import { AVISO_PAGAMENTO_NO_CANCELAMENTO } from '@/features/consultorias/constants/ciclo'
import {
  proximidadeDaConsultoria,
  ROTULO_PROXIMIDADE,
} from '@/features/consultorias/lib/proximidade'
import { rotaDoAtendimento } from '@/features/consultorias/constants/contratacao'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '@/features/consultorias/lib/formato'
import { AcoesDaConsultoria } from '@/features/consultorias/components/ciclo/AcoesDaConsultoria'
import type { ConsultoriaDoClienteDTO } from '@/features/consultorias/types/agendamento'
import { PainelVazio, Pilula, Superficie, TituloDeBloco } from '../ui/primitivos'

/**
 * As consultorias agendadas do Cliente, dentro da área que ele já conhece.
 *
 * ## Por que não é uma aba nova
 *
 * Porque uma Consultoria Agendada não é um universo à parte: é um Atendimento
 * com hora marcada. O protocolo continua sendo o identificador, o Atendimento
 * continua sendo onde a conversa acontece, e este bloco só responde à pergunta
 * que o Atendimento sozinho não responde bem — *quando é a próxima?*.
 *
 * ## A próxima ganha destaque, as outras ficam em lista
 *
 * Quem tem consultoria marcada quer saber a mais próxima antes de qualquer
 * coisa. As demais continuam visíveis logo abaixo, na mesma superfície das
 * outras listas do portal, sem inventar um segundo padrão de card.
 *
 * ## O que não está aqui
 *
 * O assunto que o Cliente escreveu. Ele já é a primeira manifestação do
 * Protocolo, e repeti-lo aqui criaria um segundo lugar para o mesmo texto —
 * que é como duas versões dele passam a existir. Também não há Cancelar nem
 * Remarcar: são regras próprias, de etapa própria, e um botão que não faz nada
 * seria pior do que a ausência dele.
 */

/**
 * O selo de proximidade — "Amanhã", "Hoje", "Em breve", "Videochamada
 * disponível". Calculado no render, a partir do relógio de quem olha; nenhum
 * cron mantém isto atualizado, e nenhum destes rótulos autoriza entrada.
 */
function SeloDeProximidade({ consultoria }: { consultoria: ConsultoriaDoClienteDTO }) {
  if (consultoria.status !== 'agendada') return null
  const estado = proximidadeDaConsultoria(
    {
      inicioEm: new Date(consultoria.inicioEm),
      fimEm: new Date(consultoria.fimEm),
      timezone: consultoria.timezone,
    },
    new Date(),
  )
  const rotulo = ROTULO_PROXIMIDADE[estado]
  if (!rotulo) return null
  return (
    <Pilula
      rotulo={rotulo}
      tom={estado === 'disponivel' ? 'sucesso' : estado === 'em_breve' ? 'atencao' : 'info'}
    />
  )
}

/**
 * A consultoria realizada: o selo, a nota que o Cliente deu — ou o convite
 * para dá-la. A avaliação em si acontece dentro do Atendimento, onde a
 * plataforma inteira já a coleta; aqui só mostramos o estado e o caminho.
 */
function BlocoDeConclusao({ consultoria }: { consultoria: ConsultoriaDoClienteDTO }) {
  if (consultoria.status !== 'concluida') return null
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
      {consultoria.avaliacao ? (
        <>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span aria-hidden className="text-amber-500">
              {'★'.repeat(consultoria.avaliacao.nota)}
              <span className="text-muted-foreground">
                {'★'.repeat(5 - consultoria.avaliacao.nota)}
              </span>
            </span>
            <span className="sr-only">
              Você avaliou com {consultoria.avaliacao.nota} de 5 estrelas.
            </span>
            <span className="text-muted-foreground">
              Você avaliou este atendimento.
            </span>
          </p>
          {consultoria.avaliacao.comentario ? (
            <p className="mt-1 text-sm text-muted-foreground">
              “{consultoria.avaliacao.comentario}”
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Consultoria concluída. Conte como foi seu atendimento — a avaliação
          fica no atendimento.
        </p>
      )}
    </div>
  )
}

/** O recorte que os modais de cancelar/remarcar precisam. */
function paraAcoes(consultoria: ConsultoriaDoClienteDTO) {
  return {
    id: consultoria.id,
    data: consultoria.data,
    inicio: consultoria.inicio,
    fim: consultoria.fim,
    timezone: consultoria.timezone,
    duracaoMinutos: consultoria.duracaoMinutos,
    valorCentavos: consultoria.valorCentavos,
    status: consultoria.status,
    protocolo: consultoria.protocolo,
    podeAlterar: consultoria.podeAlterar,
    podeConcluir: consultoria.podeConcluir,
    outraParte: consultoria.prestadorNome,
  }
}

/**
 * O cancelamento, contado por inteiro.
 *
 * Quem cancelou, quando, e o motivo se houver. Os três juntos porque
 * separados não explicam nada: "cancelada" sozinho deixa o Cliente sem saber
 * se foi ele mesmo, num clique esquecido, ou se o Profissional desmarcou.
 */
function AvisoDeCancelamento({
  consultoria,
}: {
  consultoria: ConsultoriaDoClienteDTO
}) {
  const autor =
    consultoria.canceladoPorPapel === 'prestador'
      ? 'pelo profissional'
      : consultoria.canceladoPorPapel === 'cliente'
        ? 'por você'
        : null
  const quando = consultoria.canceladoEm
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: consultoria.timezone,
      }).format(new Date(consultoria.canceladoEm))
    : null

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">
        Cancelada{autor ? ` ${autor}` : ''}
        {quando ? ` em ${quando}` : ''}.
      </p>
      {consultoria.motivoCancelamento ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Motivo: {consultoria.motivoCancelamento}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        {AVISO_PAGAMENTO_NO_CANCELAMENTO}
      </p>
    </div>
  )
}

/** `27 de agosto de 2026 · 14:30 às 15:30` — o fuso é o da consultoria. */
function quando(consultoria: ConsultoriaDoClienteDTO) {
  return `${dataPorExtensoComDiaDaSemana(consultoria.data)} · ${consultoria.inicio} às ${consultoria.fim}`
}

function AcaoDoAtendimento({
  consultoria,
  variante = 'link',
}: {
  consultoria: ConsultoriaDoClienteDTO
  variante?: 'link' | 'botao'
}) {
  // Sem protocolo não há para onde ir. Um botão morto seria pior que nenhum.
  if (!consultoria.protocolo) return null

  const destino = rotaDoAtendimento(consultoria.protocolo)
  if (variante === 'botao') {
    return (
      <Link
        href={destino}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Ver atendimento
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
      Ver atendimento
      <ArrowRight className="size-4" aria-hidden />
    </span>
  )
}

export function ConsultoriasDoCliente({
  consultorias,
}: {
  /** As agendadas e as encerradas recentes, já recortadas pelo servidor. */
  consultorias: ConsultoriaDoClienteDTO[]
}) {
  /**
   * O destaque é a próxima que **vai acontecer**.
   *
   * Uma consultoria cancelada continua na lista — ela é história recente e o
   * Cliente precisa ver o motivo —, mas ocupar o lugar de "Próxima consultoria"
   * com um compromisso desfeito responderia errado à única pergunta que aquele
   * bloco existe para responder.
   */
  const ativas = consultorias.filter((c) => c.status === 'agendada')
  const encerradas = consultorias.filter((c) => c.status !== 'agendada')
  const [proxima, ...outrasAtivas] = ativas
  const demais = [...outrasAtivas, ...encerradas]

  return (
    <section>
      <TituloDeBloco
        titulo="Consultorias agendadas"
        apoio={ativas.length ? `${ativas.length}` : undefined}
      />

      {!proxima && !encerradas.length ? (
        <PainelVazio
          titulo="Você ainda não possui consultorias agendadas."
          descricao="Escolha um profissional e marque um horário direto no perfil dele."
          acao={
            // `/profissionais` é rota real da plataforma — nenhum link inventado.
            <Link
              href="/profissionais"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Encontrar profissionais
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {proxima ? (
          <Superficie className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              {proxima.status === 'cancelada' ? (
                <Pilula rotulo="Cancelada" tom="atencao" />
              ) : proxima.status === 'concluida' ? (
                <Pilula rotulo="Concluída" tom="sucesso" />
              ) : (
                <Pilula rotulo="Próxima consultoria" tom="destaque" />
              )}
              <SeloDeProximidade consultoria={proxima} />
              <Pilula rotulo="Online" tom="neutro" />
              {proxima.pagamentoStatus === 'aprovado' ? (
                <Pilula rotulo="Pago" tom="sucesso" />
              ) : null}
            </div>

            <p className="mt-3 text-base font-semibold">{proxima.prestadorNome}</p>

            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <CalendarCheck className="size-4 shrink-0" aria-hidden />
                <span>{quando(proxima)}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock className="size-4 shrink-0" aria-hidden />
                <span>
                  {duracaoPorExtenso(proxima.duracaoMinutos)} ·{' '}
                  {formatarPreco(proxima.valorCentavos)}
                </span>
              </p>
              {/*
                A videochamada some quando a consultoria é desfeita: o encontro
                deixou de existir, e anunciar acesso a ele seria promessa falsa.
              */}
              {proxima.status !== 'cancelada' ? (
                <p className="flex items-center gap-2">
                  <Video className="size-4 shrink-0" aria-hidden />
                  <span>A videochamada abre no atendimento, no horário marcado.</span>
                </p>
              ) : null}
            </div>

            {proxima.status === 'cancelada' ? (
              <AvisoDeCancelamento consultoria={proxima} />
            ) : null}
            <BlocoDeConclusao consultoria={proxima} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {proxima.protocolo ? (
                <span className="break-all font-mono text-sm font-semibold">
                  {proxima.protocolo}
                </span>
              ) : (
                <span />
              )}
              <AcaoDoAtendimento consultoria={proxima} variante="botao" />
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <AcoesDaConsultoria consultoria={paraAcoes(proxima)} papel="cliente" />
            </div>
          </Superficie>
          ) : null}

          {demais.length ? (
            <Superficie className="divide-y overflow-hidden">
              {demais.map((consultoria) => (
                <div
                  key={consultoria.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {consultoria.prestadorNome}
                      </p>
                      {consultoria.status === 'cancelada' ? (
                        <Pilula rotulo="Cancelada" tom="atencao" />
                      ) : consultoria.status === 'concluida' ? (
                        <Pilula rotulo="Concluída" tom="sucesso" />
                      ) : null}
                      <SeloDeProximidade consultoria={consultoria} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {quando(consultoria)}
                    </p>
                    {consultoria.protocolo ? (
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {consultoria.protocolo}
                      </p>
                    ) : null}
                    {consultoria.status === 'cancelada' ? (
                      <AvisoDeCancelamento consultoria={consultoria} />
                    ) : null}
                    <BlocoDeConclusao consultoria={consultoria} />
                  </div>

                  {/*
                    Os botões ficam fora do link do card de propósito: um `<a>`
                    envolvendo `<button>` faz o clique no botão navegar junto,
                    e a pessoa cancelaria a consultoria sem ver o modal.
                  */}
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    {consultoria.protocolo ? (
                      <Link
                        href={rotaDoAtendimento(consultoria.protocolo)}
                        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Ver atendimento
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    ) : null}
                    <AcoesDaConsultoria
                      consultoria={paraAcoes(consultoria)}
                      papel="cliente"
                      compacto
                    />
                  </div>
                </div>
              ))}
            </Superficie>
          ) : null}
        </div>
      )}
    </section>
  )
}
