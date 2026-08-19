'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decidirRolagem,
  estaNoFim,
  TOLERANCIA_FIM_PX,
} from '../lib/rolagem-conversa'

export type RolagemDaConversa = {
  /**
   * Vai na área rolável das mensagens.
   *
   * É uma ref de função, e não de objeto, porque nem sempre a lista existe
   * quando o componente monta: no portal do Cliente a Conversa é uma aba, e o
   * elemento só aparece quando ela é escolhida. A ref de função avisa no
   * instante exato em que o nó entra (e sai) da árvore, que é quando a posição
   * inicial precisa ser aplicada.
   */
  refLista: (no: HTMLDivElement | null) => void
  /** Há mensagem nova abaixo enquanto a pessoa lê o histórico. */
  temNovaMensagem: boolean
  /** Leva ao fim da conversa e apaga o indicador. */
  irParaOFim: (comportamento?: ScrollBehavior) => void
}

/**
 * Rolagem de um chat que se comporta como chat.
 *
 * Uma implementação só, usada pelo painel do prestador e pelo portal do
 * Cliente: as duas telas desenham bolhas diferentes, mas a regra de quando
 * acompanhar a conversa é a mesma, e duas cópias dela divergiriam no primeiro
 * ajuste.
 *
 * O estado que importa é um só — "a pessoa estava no fim?" — e ele vive numa
 * ref, não em `useState`: é lido dentro do ouvinte de rolagem e de um
 * `ResizeObserver`, onde um valor capturado por closure estaria velho. Só o
 * indicador é estado de React, porque ele desenha algo.
 *
 * Nada aqui toca em leitura, não lidas, notificação ou tempo real: o hook
 * recebe a lista já pronta e apenas decide para onde olhar.
 */
export function useRolagemDaConversa({
  chave,
  quantidade,
  idDaUltima,
  ultimaEhMinha,
  focoEmNaoLida = false,
}: {
  /**
   * Identidade da conversa aberta — Atendimento + canal.
   *
   * Trocar de Atendimento (ou de Cliente para Interno) reinicia tudo: a
   * posição não é herdada e o indicador de mensagem nova não atravessa de uma
   * conversa para outra.
   */
  chave: string
  quantidade: number
  /** Última mensagem da lista. Detecta chegada mesmo se a contagem empatar. */
  idDaUltima: string | null
  /** A última mensagem foi escrita por quem está olhando. */
  ultimaEhMinha: boolean
  /** Há um alvo de "primeira não lida" mandando na posição neste momento. */
  focoEmNaoLida?: boolean
}): RolagemDaConversa {
  const listaRef = useRef<HTMLDivElement | null>(null)
  const ancoradoRef = useRef(true)
  const ultimaVistaRef = useRef<string | null>(null)
  const posicionadaRef = useRef<string | null>(null)
  const [no, setNo] = useState<HTMLDivElement | null>(null)
  const [temNovaMensagem, setTemNovaMensagem] = useState(false)

  /**
   * Espelho do foco em não lida, legível de dentro dos observadores.
   *
   * O `ResizeObserver` roda fora do ciclo de render e enxergaria um valor
   * capturado por closure; sem esta ref, a primeira medição dele levaria a
   * conversa para o fim exatamente no instante em que alguém pediu para ir a
   * uma mensagem específica.
   */
  const focoRef = useRef(focoEmNaoLida)
  focoRef.current = focoEmNaoLida

  // Guardar o nó também em estado é o que faz os efeitos abaixo rodarem de
  // novo quando a lista aparece — uma ref sozinha muda em silêncio.
  const refLista = useCallback((elemento: HTMLDivElement | null) => {
    listaRef.current = elemento
    setNo(elemento)
  }, [])

  /**
   * Encosta a lista no fim.
   *
   * Dentro de um `requestAnimationFrame` porque o React pode ter acabado de
   * inserir a bolha: medir antes do próximo quadro daria um `scrollHeight`
   * anterior à mensagem que motivou a rolagem — e pararia um pouco acima dela.
   */
  const irParaOFim = useCallback((comportamento: ScrollBehavior = 'smooth') => {
    ancoradoRef.current = true
    setTemNovaMensagem(false)
    requestAnimationFrame(() => {
      const lista = listaRef.current
      if (!lista) return
      const destino = lista.scrollHeight - lista.clientHeight
      if (typeof lista.scrollTo === 'function') {
        lista.scrollTo({ top: destino, behavior: comportamento })
        return
      }
      lista.scrollTop = destino
    })
  }, [])

  // Quem manda no "estou no fim" é a rolagem de verdade, inclusive a feita
  // pelo teclado ou pela roda do mouse. Passivo: o ouvinte não cancela nada.
  useEffect(() => {
    const lista = listaRef.current
    if (!lista) return

    const aoRolar = () => {
      const noFim = estaNoFim(lista, TOLERANCIA_FIM_PX)
      ancoradoRef.current = noFim
      // Chegar ao fim por conta própria resolve o aviso: a mensagem que ele
      // anunciava está agora à vista.
      if (noFim) setTemNovaMensagem(false)
    }

    lista.addEventListener('scroll', aoRolar, { passive: true })
    return () => lista.removeEventListener('scroll', aoRolar)
  }, [chave, no])

  // Abrir uma conversa (ou trocar de canal) começa no fim, que é onde está a
  // mensagem mais recente — a não ser que um alvo de não lida mande em outra
  // posição.
  useEffect(() => {
    if (!no) return
    if (posicionadaRef.current === chave) return
    posicionadaRef.current = chave
    ultimaVistaRef.current = idDaUltima
    setTemNovaMensagem(false)
    // Com um alvo de não lida mandando, a conversa **não** nasce ancorada: se
    // nascesse, o primeiro ajuste de layout a arrastaria para o fim e desfaria
    // o salto até a mensagem pedida. Ela volta a ancorar quando a pessoa
    // chegar ao fim por conta própria.
    ancoradoRef.current = !focoEmNaoLida
    if (!focoEmNaoLida) irParaOFim('auto')
    // Só quando a conversa aberta muda (ou a lista entra na tela): o resto do
    // ciclo é tratado pelo efeito abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, no])

  // Chegou mensagem: acompanhar, avisar ou não fazer nada.
  useEffect(() => {
    const chegouMensagem =
      idDaUltima !== null && idDaUltima !== ultimaVistaRef.current
    if (!chegouMensagem) return
    ultimaVistaRef.current = idDaUltima

    const decisao = decidirRolagem({
      chegouMensagem,
      ancorado: ancoradoRef.current,
      ultimaEhMinha,
      focoEmNaoLida,
    })

    if (decisao === 'ir-para-o-fim') irParaOFim('smooth')
    if (decisao === 'avisar-nova-mensagem') setTemNovaMensagem(true)
  }, [idDaUltima, quantidade, ultimaEhMinha, focoEmNaoLida, irParaOFim])

  /**
   * Conteúdo que muda de tamanho depois de renderizado.
   *
   * Anexo que carrega, imagem que só então informa a altura, texto que
   * requebra ao redimensionar a janela ou o painel: em todos esses casos o
   * `scrollHeight` cresce sem nova mensagem, e quem estava no fim ficaria
   * subitamente "quase no fim", olhando para um pedaço da última bolha. O
   * observador cobre a área rolável e cada bolha dentro dela.
   */
  useEffect(() => {
    const lista = listaRef.current
    if (!lista || typeof ResizeObserver === 'undefined') return

    const observador = new ResizeObserver(() => {
      if (focoRef.current) return
      if (!ancoradoRef.current) return
      // Sem animação: isto é correção de layout, não navegação.
      irParaOFim('auto')
    })

    observador.observe(lista)
    for (const filho of Array.from(lista.children)) observador.observe(filho)
    return () => observador.disconnect()
  }, [chave, no, quantidade, irParaOFim])

  return { refLista, temNovaMensagem, irParaOFim }
}
