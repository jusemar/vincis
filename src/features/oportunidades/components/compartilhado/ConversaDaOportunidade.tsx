'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import {
  carregarConversaDaOportunidade,
  enviarMensagemDaOportunidade,
} from '../../actions/conversa-direta'
import { LIMITE_MENSAGEM_OPORTUNIDADE } from '../../constants/oportunidade'
import type { MensagemDaOportunidadeDTO } from '../../types/oportunidade'

function formatarQuando(iso: string) {
  const data = new Date(iso)
  return Number.isNaN(data.getTime())
    ? ''
    : new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(data)
}

/**
 * A conversa da Oportunidade, dentro da própria Oportunidade.
 *
 * ## Um componente para as duas pontas
 *
 * O Cliente e o Profissional veem a mesma conversa, então veem a mesma tela.
 * Nada aqui pergunta "sou o cliente?": o servidor devolve `euSou`, e o balão
 * cai à direita quando o autor é quem está lendo. Duas telas parecidas
 * divergiriam no primeiro ajuste.
 *
 * ## Não é um menu novo
 *
 * Ele vive **dentro** do cartão da solicitação, nos dois painéis que já
 * existem. Não há área de Chat, não há rota nova e não há badge no menu: a
 * conversa é um pedaço da solicitação, e é onde ela está que se responde.
 *
 * ## Fechada até alguém pedir
 *
 * A lista carrega até 30 solicitações; buscar a conversa de todas ao abrir a
 * página seriam 30 idas ao banco para ler nenhuma. Abrir é que carrega — e
 * abrir **é** ler: a marca de leitura e o silenciamento do sino acontecem na
 * mesma chamada, do lado do servidor.
 */
export function ConversaDaOportunidade({
  oportunidadeId,
  naoLidas = 0,
  aoMudar,
}: {
  oportunidadeId: string
  /** Quantas mensagens a pessoa ainda não leu, segundo a listagem. */
  naoLidas?: number
  /** Avisa o painel para refazer a listagem — contadores, status. */
  aoMudar?: () => void
}) {
  const [aberta, setAberta] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [euSou, setEuSou] = useState<string | null>(null)
  const [podeEscrever, setPodeEscrever] = useState(true)
  const [mensagens, setMensagens] = useState<MensagemDaOportunidadeDTO[]>([])
  const fim = useRef<HTMLDivElement | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const resultado = await carregarConversaDaOportunidade({ oportunidadeId })
    setCarregando(false)
    if (!resultado.sucesso) {
      setErro(resultado.mensagem)
      return
    }
    setErro(null)
    setMensagens(resultado.dados.mensagens)
    setPodeEscrever(resultado.dados.podeEscrever)
    setEuSou(resultado.dados.euSou)
  }, [oportunidadeId])

  // Abrir é um evento, não uma sincronização: carregar dentro do clique evita a
  // renderização em cascata que um efeito com `setState` provoca.
  function alternar() {
    const proximo = !aberta
    setAberta(proximo)
    if (proximo) void carregar()
  }

  // A conversa é cronológica: o que interessa ao abrir é o fim dela.
  useEffect(() => {
    if (aberta && mensagens.length) {
      fim.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [aberta, mensagens])

  async function enviar() {
    const conteudo = texto.trim()
    if (!conteudo || enviando) return
    setEnviando(true)
    const resultado = await enviarMensagemDaOportunidade({
      oportunidadeId,
      conteudo,
    })
    setEnviando(false)
    if (!resultado.sucesso) {
      setErro(resultado.mensagem)
      return
    }
    setTexto('')
    setErro(null)
    await carregar()
    aoMudar?.()
  }

  return (
    <section className="mt-4 rounded-xl border bg-muted/20">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="size-4 text-muted-foreground" />
          Conversa
          {naoLidas > 0 ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
              {naoLidas}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {aberta ? 'Ocultar' : 'Abrir'}
        </span>
      </button>

      {aberta ? (
        <div className="border-t px-4 py-3">
          {carregando && !mensagens.length ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : null}

          {!carregando && !mensagens.length ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma mensagem ainda. Escreva a primeira.
            </p>
          ) : null}

          {mensagens.length ? (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {mensagens.map((mensagem) => {
                const minha = mensagem.autorId === euSou
                return (
                  <li
                    key={mensagem.id}
                    className={minha ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        minha
                          ? 'bg-primary/10 text-foreground'
                          : 'border bg-card text-foreground'
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        {minha ? 'Você' : mensagem.autorNome}
                        {' · '}
                        {formatarQuando(mensagem.criadoEm)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-sm">
                        {mensagem.conteudo}
                      </p>
                    </div>
                  </li>
                )
              })}
              <div ref={fim} />
            </ul>
          ) : null}

          {erro ? (
            <p className="mt-2 text-xs font-medium text-destructive">{erro}</p>
          ) : null}

          {podeEscrever ? (
            <div className="mt-3 space-y-2">
              <Textarea
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                maxLength={LIMITE_MENSAGEM_OPORTUNIDADE}
                rows={2}
                placeholder="Escreva sua mensagem…"
                aria-label="Nova mensagem"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  A negociação é feita diretamente entre vocês.
                </p>
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={enviando || !texto.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {enviando ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Esta solicitação foi encerrada. O histórico continua aqui.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
