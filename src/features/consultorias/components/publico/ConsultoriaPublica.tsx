'use client'

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/features/usuarios/hooks/useAuth'
import {
  contextoDoPrestador,
  limparContexto,
  lerContexto,
  salvarContexto,
} from '../../lib/contexto-contratacao'
import type { AgendaDoMesDTO, SelecaoDeConsultoria } from '../../types/consultoria'
import { CardConsultoria } from './CardConsultoria'
import { ModalContratacaoConsultoria } from './ModalContratacaoConsultoria'

/**
 * O card do perfil e o modal de contratação, juntos.
 *
 * ## Por que existe um invólucro
 *
 * Porque o perfil não precisa saber nada disso. `PerfilProfissionalV2` já é um
 * arquivo grande, e ligar calendário, modal, rascunho e retorno de login lá
 * dentro faria a contratação de consultoria virar mais um assunto de um
 * componente que já tem muitos. Aqui o perfil enxerga um componente só; o
 * domínio guarda a fiação.
 *
 * ## O caminho de volta do login
 *
 * O ponto delicado desta etapa. Quem escreveu o assunto e só então descobriu
 * que precisa entrar não pode voltar para uma tela em branco. A sequência é:
 *
 * 1. o modal avisa que precisa de sessão;
 * 2. guardamos escolha e rascunho no `sessionStorage` — **nunca na URL**, que
 *    vaza para histórico, log e `Referer`;
 * 3. mandamos a pessoa para o login central da Vincis pelo mecanismo que já
 *    existe (`?entrar=1`, lido pela navegação em qualquer página pública);
 * 4. no instante em que a sessão aparece, reabrimos o modal como estava.
 *
 * O passo 4 observa uma coisa só: a **transição** de "sem sessão" para "com
 * sessão". Serve para os dois cenários possíveis — o login que acontece sem
 * recarregar (e este componente nunca desmonta) e a página que remonta no
 * caminho, onde a sessão também chega depois, quando o `AuthProvider` termina
 * de conferi-la. Um caminho só, e não dois para manter em dia.
 *
 * Nada disso reserva o horário. Ir para o login não segura nada, e outro
 * Cliente pode ficar com aquele horário enquanto o primeiro digita a senha:
 * `hold` e concorrência são a etapa seguinte, e fingir aqui que existem seria
 * pior do que não ter.
 */

export type ConsultoriaPublicaProps = {
  nomeExibido: string
  agendaInicial: AgendaDoMesDTO | null
}

/** `sessionStorage` não existe no servidor nem em aba com storage bloqueado. */
function obterStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function ConsultoriaPublica({
  nomeExibido,
  agendaInicial,
}: ConsultoriaPublicaProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { usuario } = useAuth()

  const [selecao, setSelecao] = useState<SelecaoDeConsultoria | null>(null)
  const [descricaoInicial, setDescricaoInicial] = useState('')
  const [aberto, setAberto] = useState(false)

  /**
   * Contador de aberturas — a `key` do modal.
   *
   * Cada abertura é uma conversa nova: rascunho novo, resposta do servidor
   * nova. Remontar pela `key` é o que garante isso sem um efeito de limpeza que
   * precisaria lembrar de zerar cada campo. Sem ele, um "horário indisponível"
   * de dez minutos atrás continuaria na tela depois de a pessoa escolher outro
   * horário — e um "tudo pronto" antigo seria pior, porque afirmaria
   * disponibilidade que ninguém reconferiu.
   */
  const [abertura, setAbertura] = useState(0)

  const prestadorId = agendaInicial?.consultoria?.prestadorId ?? null

  /**
   * Quem estava logado da última vez que renderizamos.
   *
   * Guardar o valor anterior em estado e compará-lo durante a renderização é o
   * padrão que o React documenta para "ajustar estado quando algo muda" — e
   * evita o efeito que dispararia `setState` em cascata só para observar uma
   * troca de sessão.
   */
  const [sessaoVista, setSessaoVista] = useState<string | null>(usuario?.id ?? null)
  const sessaoAtual = usuario?.id ?? null

  if (sessaoAtual !== sessaoVista) {
    setSessaoVista(sessaoAtual)

    // Só a chegada de uma sessão interessa: sair não restaura nada.
    if (sessaoAtual && !aberto && prestadorId) {
      const storage = obterStorage()
      const salvo = storage
        ? contextoDoPrestador(lerContexto(storage), prestadorId)
        : null
      if (salvo && storage) {
        // O rascunho é consumido na leitura: retomar o fluxo uma vez é
        // continuidade, reabrir a cada visita seria assombração.
        limparContexto(storage)
        setSelecao(salvo.selecao)
        setDescricaoInicial(salvo.descricao)
        setAbertura((valor) => valor + 1)
        setAberto(true)
      }
    }
  }

  const abrirComSelecao = useCallback((escolha: SelecaoDeConsultoria) => {
    setSelecao(escolha)
    setDescricaoInicial('')
    setAbertura((valor) => valor + 1)
    setAberto(true)
  }, [])

  function fechar() {
    setAberto(false)
    // Fechar por vontade própria descarta o rascunho: guardá-lo faria o modal
    // ressuscitar sozinho no próximo login desta aba.
    const storage = obterStorage()
    if (storage) limparContexto(storage)
  }

  function irParaLogin(descricao: string) {
    if (!selecao) return

    const storage = obterStorage()
    if (storage) salvarContexto(storage, { selecao, descricao })

    // O modal sai da frente para o login central aparecer sozinho na tela. Ele
    // volta pela comparação de sessão acima, assim que houver sessão.
    setAberto(false)

    // `?entrar=1` é o mecanismo que a plataforma já usa para abrir o login em
    // qualquer página pública, sem recarregar e sem sair do perfil. Os demais
    // parâmetros da URL — `?prestador=` inclusive — seguem intactos, e a
    // descrição não entra em nenhum deles.
    const params = new URLSearchParams(searchParams.toString())
    params.set('entrar', '1')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      <CardConsultoria
        nomeExibido={nomeExibido}
        agendaInicial={agendaInicial}
        onAgendar={abrirComSelecao}
      />
      {selecao ? (
        <ModalContratacaoConsultoria
          key={abertura}
          aberto={aberto}
          onFechar={fechar}
          nomeExibido={nomeExibido}
          selecao={selecao}
          descricaoInicial={descricaoInicial}
          onPrecisaEntrar={irParaLogin}
        />
      ) : null}
    </>
  )
}
