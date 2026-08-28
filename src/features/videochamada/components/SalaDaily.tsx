'use client'

import { useEffect, useRef, useState } from 'react'
import type { DailyCall } from '@daily-co/daily-js'

/**
 * O Daily Prebuilt, dentro de um `div` da Vincis.
 *
 * ## Por que Prebuilt, e não uma sala construída à mão
 *
 * Porque grade de vídeo, seleção de dispositivo, compartilhamento de tela,
 * reconexão e negociação WebRTC são um produto inteiro — e um que a Daily já
 * mantém, testa em dezenas de navegadores e corrige quando o iOS muda de ideia.
 * Reescrever isso para ganhar controle sobre a aparência seria trocar uma
 * chamada que funciona por uma que precisamos consertar.
 *
 * ## Por que o `import()` é dinâmico
 *
 * `daily-js` é grande. Carregá-lo no topo faria toda pessoa que abre um
 * Atendimento baixar um SDK de videochamada — inclusive quem nunca teve uma
 * consultoria. Aqui ele só chega ao navegador quando alguém realmente entra na
 * sala.
 *
 * ## O que este componente não faz
 *
 * Não decide se pode entrar. Quando ele monta, a decisão já foi tomada pelo
 * servidor e o token já veio com prazo. Ele recebe credencial pronta, usa uma
 * vez e some — nada é guardado, nada volta para a URL.
 */

export type SalaDailyProps = {
  url: string
  token: string
  /** Chamado quando o participante sai pelo botão da própria chamada. */
  aoSair: () => void
  /** Chamado quando a Daily não consegue entrar. Recebe só um rótulo curto. */
  aoFalhar: () => void
}

export function SalaDaily({ url, token, aoSair, aoFalhar }: SalaDailyProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const [carregando, setCarregando] = useState(true)

  /**
   * As funções de callback vivem num ref para não entrarem nas dependências.
   *
   * Se entrassem, uma função recriada a cada render do pai desmontaria e
   * remontaria a chamada — a pessoa cairia da consulta porque um componente
   * acima re-renderizou.
   */
  const callbacks = useRef({ aoSair, aoFalhar })
  callbacks.current = { aoSair, aoFalhar }

  useEffect(() => {
    let chamada: DailyCall | null = null
    let descartado = false

    async function entrar() {
      const alvo = container.current
      if (!alvo) return

      const { default: Daily } = await import('@daily-co/daily-js')
      if (descartado) return

      chamada = Daily.createFrame(alvo, {
        // O iframe preenche o painel da Vincis; quem manda no tamanho é o
        // nosso layout, não um retângulo fixo do SDK.
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          display: 'block',
        },
        showLeaveButton: true,
        showFullscreenButton: true,
        lang: 'pt-BR',
      })

      chamada.on('joined-meeting', () => setCarregando(false))
      chamada.on('left-meeting', () => callbacks.current.aoSair())
      chamada.on('error', () => callbacks.current.aoFalhar())

      try {
        await chamada.join({ url, token })
      } catch {
        // O motivo real fica com a Daily; a tela mostra a frase única de sempre.
        if (!descartado) callbacks.current.aoFalhar()
      }
    }

    void entrar()

    return () => {
      descartado = true
      // `destroy()` desliga câmera e microfone e remove o iframe. Sem isto, a
      // luz da webcam continuaria acesa depois de fechar o painel.
      chamada?.destroy()
    }
  }, [url, token])

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={container} className="h-full w-full" />
      {carregando ? (
        <p
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/80"
          aria-live="polite"
        >
          Conectando à videochamada…
        </p>
      ) : null}
    </div>
  )
}
