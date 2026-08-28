'use client'

import { useEffect, useState, useTransition } from 'react'
import { AlertCircle, CalendarClock, Video, X } from 'lucide-react'
import { entrarNaVideochamada } from '../actions/videochamada'
import {
  ACAO_ENTRAR,
  MENSAGENS_DA_JANELA,
  MENSAGEM_FALHA_VIDEOCHAMADA,
  TITULO_VIDEOCHAMADA,
} from '../constants/videochamada'
import { janelaDaVideochamada, situacaoDaJanela } from '../lib/janela'
import type { ResultadoDeEntrada } from '../types/videochamada'
import { SalaDaily } from './SalaDaily'

/**
 * A área da videochamada dentro do Atendimento — a mesma para os dois lados.
 *
 * ## Por que Cliente e Profissional usam este componente
 *
 * Porque a regra é uma só. Duas telas parecidas viram duas regras parecidas, e
 * duas regras parecidas divergem no primeiro ajuste. O que muda entre um e
 * outro é apenas *com quem* a pessoa vai falar — o nome no cabeçalho — e isso é
 * uma propriedade, não um segundo componente.
 *
 * ## O botão desabilitado não é a segurança
 *
 * Ele é cortesia: evita um clique que ia falhar. A recusa de verdade acontece
 * no servidor, a cada clique, com o relógio do servidor. Um navegador com a
 * data adiantada desenha o botão liberado, clica, e leva "fora da janela" na
 * mesma. É por isso que o estado da tela pode ser recalculado à vontade sem
 * nunca virar permissão.
 *
 * ## Por que a chamada abre num painel, e não numa aba nova
 *
 * Porque a consulta é da Vincis. Mandar as duas pessoas para `daily.co`
 * entregaria o momento mais importante do produto a um endereço que não é o
 * nosso — e tiraria da tela o protocolo, o nome de quem está do outro lado e o
 * caminho de volta para o Atendimento.
 */

export type PainelVideochamadaProps = {
  atendimentoId: string
  protocolo: string
  /** Nome de quem está do outro lado — só para o cabeçalho Vincis. */
  nomeDaOutraParte: string
  consultoria: {
    inicioEm: string
    fimEm: string
    timezone: string
    janelaAbreEm: string
    janelaFechaEm: string
  }
}

/** `sexta-feira, 28 de agosto de 2026 · 14:30` no fuso contratado. */
function quandoPorExtenso(iso: string, timezone: string) {
  const data = new Date(iso)
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(data)
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(data)
  return `${dia} · ${hora}`
}

function horaCurta(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function PainelVideochamada({
  atendimentoId,
  protocolo,
  nomeDaOutraParte,
  consultoria,
}: PainelVideochamadaProps) {
  const [instante, setInstante] = useState(() => Date.now())
  const [entrada, setEntrada] = useState<ResultadoDeEntrada | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, iniciar] = useTransition()

  const janela = janelaDaVideochamada({
    inicioEm: new Date(consultoria.inicioEm),
    fimEm: new Date(consultoria.fimEm),
  })
  const situacao = situacaoDaJanela(janela, new Date(instante))
  const naSala = entrada?.situacao === 'autorizado'

  /**
   * O relógio é um sistema externo: o `setState` acontece no retorno de chamada
   * dele, nunca no corpo do efeito. Meio minuto basta — a janela muda de estado
   * uma vez, e ninguém precisa ver o segundo virar.
   */
  useEffect(() => {
    if (naSala) return
    const timer = setInterval(() => setInstante(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [naSala])

  function abrir() {
    setErro(null)
    iniciar(async () => {
      const resultado = await entrarNaVideochamada({ atendimentoId })
      if (resultado.situacao === 'autorizado') {
        setEntrada(resultado)
        return
      }
      // Recusa do servidor manda na tela: o relógio local é sincronizado com a
      // decisão dele, e não o contrário.
      setInstante(Date.now())
      setErro(resultado.mensagem || MENSAGEM_FALHA_VIDEOCHAMADA)
    })
  }

  function fechar() {
    setEntrada(null)
  }

  return (
    <section
      aria-labelledby="titulo-videochamada"
      className="rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Video className="size-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 id="titulo-videochamada" className="text-sm font-semibold text-foreground">
              {TITULO_VIDEOCHAMADA}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {MENSAGENS_DA_JANELA[situacao]}
            </p>
          </div>
        </div>

        {situacao === 'aberta' ? (
          <button
            type="button"
            onClick={abrir}
            disabled={processando}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Video className="size-4" aria-hidden />
            {processando ? 'Abrindo…' : ACAO_ENTRAR}
          </button>
        ) : (
          /*
            Desabilitado e explicado. Some no estado "encerrada": ali não há
            ação possível, e um botão morto só faria a pessoa tentar.
          */
          situacao === 'antes' && (
            <button
              type="button"
              disabled
              aria-describedby="titulo-videochamada"
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground opacity-70"
            >
              <Video className="size-4" aria-hidden />
              {ACAO_ENTRAR}
            </button>
          )
        )}
      </div>

      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5 shrink-0" aria-hidden />
        <span>
          {quandoPorExtenso(consultoria.inicioEm, consultoria.timezone)} às{' '}
          {horaCurta(consultoria.fimEm, consultoria.timezone)}
          {situacao === 'antes'
            ? ` · entrada libera às ${horaCurta(consultoria.janelaAbreEm, consultoria.timezone)}`
            : situacao === 'aberta'
              ? ` · acesso até ${horaCurta(consultoria.janelaFechaEm, consultoria.timezone)}`
              : ''}
        </span>
      </p>

      {erro ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </p>
      ) : null}

      {naSala && entrada.situacao === 'autorizado' ? (
        <ModalDaChamada
          url={entrada.url}
          token={entrada.token}
          protocolo={protocolo}
          nomeDaOutraParte={nomeDaOutraParte}
          aoFechar={fechar}
          aoFalhar={() => {
            fechar()
            setErro(MENSAGEM_FALHA_VIDEOCHAMADA)
          }}
        />
      ) : null}
    </section>
  )
}

/**
 * A chamada em tela cheia, com a moldura da Vincis por cima.
 *
 * O cabeçalho é nosso — "Consultoria online", protocolo, com quem — e o miolo é
 * o Prebuilt. Não tentamos redesenhar os controles da Daily: a acessibilidade
 * de dentro do iframe é responsabilidade dela, e reimplementá-la por fora daria
 * uma cópia pior.
 *
 * O que precisa ser nosso é a saída: `Escape` fecha, o botão de fechar é o
 * primeiro elemento focável e o `role="dialog"` avisa o leitor de tela de que a
 * página inteira ficou para trás.
 */
function ModalDaChamada({
  url,
  token,
  protocolo,
  nomeDaOutraParte,
  aoFechar,
  aoFalhar,
}: {
  url: string
  token: string
  protocolo: string
  nomeDaOutraParte: string
  aoFechar: () => void
  aoFalhar: () => void
}) {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    // A página atrás não rola enquanto a chamada está aberta.
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflowAnterior
    }
  }, [aoFechar])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Consultoria online com ${nomeDaOutraParte}, protocolo ${protocolo}`}
      /*
        `dvh` e não `vh`: no celular a barra do navegador entra e sai, e `vh`
        deixaria os controles da chamada escondidos atrás dela.
      */
      className="fixed inset-0 z-[100] flex h-dvh w-screen flex-col bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Consultoria online</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{protocolo}</span>
            <span aria-hidden> · </span>
            {nomeDaOutraParte}
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          autoFocus
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
          Sair da videochamada
        </button>
      </header>

      {/*
        `min-h-0` para o filheiro poder encolher dentro do flex — sem isto o
        iframe empurra o cabeçalho para fora da tela no celular.
      */}
      <div className="min-h-0 flex-1">
        <SalaDaily url={url} token={token} aoSair={aoFechar} aoFalhar={aoFalhar} />
      </div>
    </div>
  )
}
