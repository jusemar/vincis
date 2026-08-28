import Link from 'next/link'
import { ArrowRight, CalendarCheck, Clock, Video } from 'lucide-react'
import { rotaDoAtendimento } from '@/features/consultorias/constants/contratacao'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '@/features/consultorias/lib/formato'
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
  futuras,
}: {
  futuras: ConsultoriaDoClienteDTO[]
}) {
  const [proxima, ...demais] = futuras

  return (
    <section>
      <TituloDeBloco
        titulo="Consultorias agendadas"
        apoio={futuras.length ? `${futuras.length}` : undefined}
      />

      {!proxima ? (
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
          <Superficie className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Pilula rotulo="Próxima consultoria" tom="destaque" />
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
              <p className="flex items-center gap-2">
                <Video className="size-4 shrink-0" aria-hidden />
                {/*
                  A videochamada é etapa própria. Dizer isso é melhor do que um
                  botão que não abre nada — e muito melhor do que um link de
                  reunião externo, que não é o caminho da plataforma.
                */}
                <span>Videochamada disponível em breve</span>
              </p>
            </div>

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
          </Superficie>

          {demais.length ? (
            <Superficie className="divide-y overflow-hidden">
              {demais.map((consultoria) => {
                const conteudo = (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {consultoria.prestadorNome}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {quando(consultoria)}
                      </p>
                      {consultoria.protocolo ? (
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {consultoria.protocolo}
                        </p>
                      ) : null}
                    </div>
                    <AcaoDoAtendimento consultoria={consultoria} />
                  </>
                )

                const classes =
                  'flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6'

                return consultoria.protocolo ? (
                  <Link
                    key={consultoria.id}
                    href={rotaDoAtendimento(consultoria.protocolo)}
                    className={`${classes} transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none`}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div key={consultoria.id} className={classes}>
                    {conteudo}
                  </div>
                )
              })}
            </Superficie>
          ) : null}
        </div>
      )}
    </section>
  )
}
