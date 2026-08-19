'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { rotaDoDestino } from '@/features/notificacoes/lib/rota-do-destino'
import {
  canalDoAtendimento,
  canalDoConvite,
  canalDoUsuario,
} from '@/integracoes/realtime/canais'
import {
  EVENTO_ATUALIZACAO,
  type EventoRealtime,
  type SeveridadeEvento,
} from '@/integracoes/realtime/eventos'
import { obterConexaoRealtime } from '@/integracoes/realtime/navegador'
import { deveExibirToast, type ContextoAtivo } from '../lib/contexto-ativo'

type Ouvinte = (evento: EventoRealtime) => void

type ValorTempoReal = {
  /**
   * Registra um ouvinte para os eventos recebidos.
   *
   * Existe para o que o `router.refresh()` não alcança: pedaços de tela que
   * carregam dados por Server Action no próprio navegador — a caixa de
   * Convites e o sino, por exemplo. Eles precisam ser avisados para refazer a
   * própria consulta; o resto da página o refresh já cobre.
   */
  aoReceberEvento: (ouvinte: Ouvinte) => () => void
  /** A tela diz o que está aberto; o provider decide se o toast faz sentido. */
  registrarContextoAtivo: (contexto: ContextoAtivo) => void
  /** Assina o canal de um Atendimento enquanto o painel estiver aberto. */
  assinarAtendimento: (atendimentoId: string | null) => void
  /** Assina o canal de uma negociação enquanto a caixa estiver aberta. */
  assinarConvite: (conviteId: string | null) => void
  /** `false` quando não há credenciais: a tela pode dizer que está sem tempo real. */
  conectado: boolean
}

const TempoRealContexto = createContext<ValorTempoReal>({
  aoReceberEvento: () => () => undefined,
  registrarContextoAtivo: () => undefined,
  assinarAtendimento: () => undefined,
  assinarConvite: () => undefined,
  conectado: false,
})

export function useTempoReal() {
  return useContext(TempoRealContexto)
}

/**
 * Reage a cada evento recebido.
 *
 * O ouvinte é guardado numa referência: passar uma função nova a cada render
 * (o caso normal) não deve provocar assinatura e cancelamento em cadeia.
 */
export function useEventoRealtime(ouvinte: Ouvinte) {
  const { aoReceberEvento } = useTempoReal()
  const ultimo = useRef(ouvinte)

  // A referência é atualizada no efeito, e não durante o render: escrever em
  // ref enquanto o React renderiza é justamente o que torna o valor
  // imprevisível quando o render é descartado.
  useEffect(() => {
    ultimo.current = ouvinte
  }, [ouvinte])

  useEffect(
    () => aoReceberEvento((evento) => ultimo.current(evento)),
    [aoReceberEvento],
  )
}

/**
 * Espera entre receber um aviso e refazer as consultas.
 *
 * Uma conversa animada entrega vários eventos em sequência; sem esta janela,
 * cada um dispararia um `router.refresh()` e a tela passaria mais tempo
 * recarregando do que mostrando. 300ms é curto o bastante para parecer
 * instantâneo e longo o bastante para agrupar uma rajada.
 */
const AGRUPAMENTO_MS = 300

/**
 * Severidade do domínio → variante do toast.
 *
 * O Sonner do projeto roda com `richColors`, então cada variante já traz a cor
 * suave e o ícone que o design system definiu — verde para o que deu certo,
 * neutro/azul para novidade, âmbar para o que pede atenção, vermelho para
 * falha. Nada de paleta nova: o mapa só liga a semântica escolhida por quem
 * publicou o evento à variante que já existe.
 *
 * Evento sem severidade cai em `info`, que é o tom de "algo mudou" — o mesmo
 * que a tela mostrava antes desta etapa.
 */
const TOAST_POR_SEVERIDADE: Record<
  SeveridadeEvento,
  (mensagem: string, opcoes?: Parameters<typeof toast.info>[1]) => unknown
> = {
  sucesso: toast.success,
  informacao: toast.info,
  atencao: toast.warning,
  erro: toast.error,
}

/** Assina as mudanças de estado do socket para o `useSyncExternalStore`. */
function assinarEstadoDaConexao(avisar: () => void) {
  const conexao = obterConexaoRealtime()
  if (!conexao) return () => undefined
  conexao.connection.bind('state_change', avisar)
  return () => {
    conexao.connection.unbind('state_change', avisar)
  }
}

function lerEstadoDaConexao() {
  return obterConexaoRealtime()?.connection.state === 'connected'
}

/**
 * Tempo real da aplicação.
 *
 * O desenho tem uma regra central: **o evento não traz o dado, ele traz o
 * aviso**. Ao receber, a tela chama `router.refresh()`, e o servidor devolve o
 * mesmo HTML que devolveria num F5 — com todas as regras de autorização
 * aplicadas de novo. É isso que impede o tempo real de virar um segundo
 * caminho de leitura, com permissões próprias para manter em dia.
 *
 * Consequências boas de graça: a Conversa preserva rolagem e estado local
 * (o refresh do App Router não desmonta a árvore), o Protocolo continua
 * obedecendo a regra assimétrica de visibilidade, e uma queda de conexão custa
 * no máximo um atraso — ao reconectar, refazemos as consultas porque eventos
 * perdidos não são reenviados.
 */
export function TempoRealProvider({
  usuarioId,
  children,
}: {
  usuarioId?: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  /**
   * Estado da conexão lido da própria conexão, e não copiado para o React.
   *
   * `useSyncExternalStore` existe exatamente para isto: a verdade vive fora do
   * React (no socket), e espelhá-la com `useState` dentro de um efeito criaria
   * um segundo lugar capaz de discordar do primeiro.
   */
  const conectado = useSyncExternalStore(
    assinarEstadoDaConexao,
    lerEstadoDaConexao,
    () => false,
  )
  const contextoRef = useRef<ContextoAtivo>(null)
  const ouvintesRef = useRef(new Set<Ouvinte>())
  const relogioRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [atendimentoAssinado, setAtendimentoAssinado] = useState<string | null>(
    null,
  )
  const [conviteAssinado, setConviteAssinado] = useState<string | null>(null)

  const atualizar = useCallback(() => {
    if (relogioRef.current) clearTimeout(relogioRef.current)
    relogioRef.current = setTimeout(() => router.refresh(), AGRUPAMENTO_MS)
  }, [router])

  const tratarEvento = useCallback(
    (evento: EventoRealtime) => {
      atualizar()
      for (const ouvinte of ouvintesRef.current) ouvinte(evento)
      if (!usuarioId) return
      if (
        !deveExibirToast({
          evento,
          contexto: contextoRef.current,
          usuarioId,
          abaVisivel:
            typeof document === 'undefined' || document.visibilityState === 'visible',
        })
      ) {
        return
      }

      // `rotaDoDestino` monta o deep-link do painel do prestador. Para quem
      // está no portal do Cliente ele levaria a uma rota que a guarda devolve —
      // então lá o toast é só o aviso, e a própria página já se atualizou.
      const noPainel = !pathname?.startsWith('/cliente')
      const destino = !noPainel
        ? null
        : evento.conviteId
          ? rotaDoDestino({ pagina: 'atendimentos', conviteId: evento.conviteId })
          : evento.protocolo
            ? rotaDoDestino({
                pagina: 'atendimentos',
                atendimento: evento.protocolo,
                aba: evento.aba ?? undefined,
                canal: evento.canalConversa ?? undefined,
              })
            : null

      const mostrar =
        TOAST_POR_SEVERIDADE[evento.severidade ?? 'informacao'] ?? toast.info

      mostrar(evento.titulo ?? 'Nova atualização', {
        action: destino
          ? { label: 'Abrir', onClick: () => router.push(destino) }
          : undefined,
      })
    },
    [atualizar, pathname, router, usuarioId],
  )

  // Canal pessoal: notificações, toasts e contadores de quem está logado.
  useEffect(() => {
    if (!usuarioId) return
    const conexao = obterConexaoRealtime()
    if (!conexao) return

    const canal = conexao.subscribe(canalDoUsuario(usuarioId))
    canal.bind(EVENTO_ATUALIZACAO, tratarEvento)

    return () => {
      canal.unbind(EVENTO_ATUALIZACAO, tratarEvento)
      conexao.unsubscribe(canalDoUsuario(usuarioId))
    }
  }, [usuarioId, tratarEvento])

  // Canal do Atendimento aberto: quem está com o painel na tela vê a novidade
  // mesmo quando o aviso pessoal não é dirigido a ele.
  useEffect(() => {
    if (!atendimentoAssinado) return
    const conexao = obterConexaoRealtime()
    if (!conexao) return

    const nome = canalDoAtendimento(atendimentoAssinado)
    const canal = conexao.subscribe(nome)
    canal.bind(EVENTO_ATUALIZACAO, tratarEvento)

    return () => {
      canal.unbind(EVENTO_ATUALIZACAO, tratarEvento)
      conexao.unsubscribe(nome)
    }
  }, [atendimentoAssinado, tratarEvento])

  useEffect(() => {
    if (!conviteAssinado) return
    const conexao = obterConexaoRealtime()
    if (!conexao) return

    const nome = canalDoConvite(conviteAssinado)
    const canal = conexao.subscribe(nome)
    canal.bind(EVENTO_ATUALIZACAO, tratarEvento)

    return () => {
      canal.unbind(EVENTO_ATUALIZACAO, tratarEvento)
      conexao.unsubscribe(nome)
    }
  }, [conviteAssinado, tratarEvento])

  /**
   * Consistência depois de qualquer interrupção.
   *
   * Reconexão do socket e volta da aba ao primeiro plano refazem as consultas.
   * Nunca supomos que a fila de eventos chegou inteira: notebook que dormiu,
   * túnel, wifi trocado — em todos esses casos o estado real está no banco, e
   * buscá-lo de novo é barato perto de mostrar uma tela desatualizada.
   */
  useEffect(() => {
    const conexao = obterConexaoRealtime()
    if (!conexao) return

    let estavaFora = false
    const aoMudarEstado = ({ current }: { current: string }) => {
      if (current === 'connected') {
        if (estavaFora) {
          estavaFora = false
          router.refresh()
        }
        return
      }
      if (current === 'unavailable' || current === 'disconnected') {
        estavaFora = true
      }
    }

    conexao.connection.bind('state_change', aoMudarEstado)
    return () => {
      conexao.connection.unbind('state_change', aoMudarEstado)
    }
  }, [router])

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [router])

  const valor = useMemo<ValorTempoReal>(
    () => ({
      aoReceberEvento: (ouvinte: Ouvinte) => {
        ouvintesRef.current.add(ouvinte)
        return () => {
          ouvintesRef.current.delete(ouvinte)
        }
      },
      registrarContextoAtivo: (contexto) => {
        contextoRef.current = contexto
      },
      assinarAtendimento: setAtendimentoAssinado,
      assinarConvite: setConviteAssinado,
      conectado,
    }),
    [conectado],
  )

  return (
    <TempoRealContexto.Provider value={valor}>
      {children}
    </TempoRealContexto.Provider>
  )
}
