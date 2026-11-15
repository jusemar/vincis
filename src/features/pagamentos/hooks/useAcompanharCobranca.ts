'use client'

import { useEffect, useRef, useState } from 'react'
import { INTERVALO_POLLING_COBRANCA_MS } from '../constants/cobranca'

/**
 * Pergunta ao servidor, de tempos em tempos, como está o pagamento.
 *
 * ## Por que polling, e não Pusher
 *
 * O Pusher da Vincis avisa usuários em canais de Atendimento e Oportunidade; o
 * Cliente que está pagando ainda não tem Atendimento nenhum, e abrir um canal
 * só para isto seria mais autorização para manter. Mais importante: a pergunta
 * do polling **é** a reconciliação — o servidor consulta a Efí (com freio) a
 * cada poucos segundos, então a confirmação chega mesmo sem webhook (em
 * `localhost`, por exemplo, onde a Efí não alcança).
 *
 * ## O que este hook não faz
 *
 * Não decide nada. Ele repassa a resposta do servidor; quem diz "pago" é a
 * Efí, consultada lá. Para de perguntar quando `ativo` vira falso, quando a aba
 * fica escondida e quando o componente desmonta — e nunca sobrepõe duas
 * perguntas.
 */
export function useAcompanharCobranca<T>({
  ativo,
  consultar,
  aoResponder,
}: {
  ativo: boolean
  consultar: () => Promise<T>
  aoResponder: (resposta: T) => void
}) {
  const consultarRef = useRef(consultar)
  const responderRef = useRef(aoResponder)
  useEffect(() => {
    consultarRef.current = consultar
    responderRef.current = aoResponder
  })

  useEffect(() => {
    if (!ativo) return
    let emAndamento = false
    let encerrado = false
    const timer = setInterval(async () => {
      if (emAndamento || document.visibilityState !== 'visible') return
      emAndamento = true
      try {
        const resposta = await consultarRef.current()
        if (!encerrado) responderRef.current(resposta)
      } catch {
        // Falha de rede momentânea: a próxima volta tenta de novo.
      } finally {
        emAndamento = false
      }
    }, INTERVALO_POLLING_COBRANCA_MS)
    return () => {
      encerrado = true
      clearInterval(timer)
    }
  }, [ativo])
}

/** Relógio de um segundo para o contador de validade. Só desenha. */
export function useRelogio(ativo: boolean) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ativo) return
    const timer = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ativo])
  return agora
}
