'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { RespostasPrecificacao } from '@/features/precificacao/types/precificacao'
import { demonstrarInteresseNaSimulacao } from '../../actions/interesse'

/**
 * Onde a chave da intenção fica enquanto o cliente entra na conta.
 *
 * Por prestador, e em `sessionStorage`: é um rascunho de uma aba, não um dado da
 * pessoa. Fecha a aba, some — que é o comportamento certo para "eu ia clicar em
 * um botão".
 */
const chaveDaIntencao = (prestadorId: string) =>
  `vincis:interesse-simulacao:${prestadorId}`

/**
 * "Tenho interesse": o botão que transforma a simulação em conversa.
 *
 * ## O que ele **não** é
 *
 * Não é contratar, comprar, assinar nem pagar — e o texto ao redor diz isso em
 * voz alta, porque a página inteira acabou de mostrar um preço e quem lê pode
 * confundir as duas coisas. O que ele cria é uma Oportunidade dirigida a este
 * Profissional, no mesmo módulo em que todas as outras vivem.
 *
 * ## Entrar no meio do caminho não perde a simulação
 *
 * Quem não está autenticado não é levado para outra página: o botão guarda a
 * intenção e abre o login **por cima da página atual**, com o `?entrar=1` que a
 * plataforma inteira já usa. O modal preserva o resto da query ao fechar, então
 * a página volta com o mesmo `prestador` — e a intenção guardada dispara
 * sozinha assim que a sessão existe.
 *
 * O `sessionStorage` cobre o caso em que a aba recarrega no meio: sem ele, o
 * estado em memória bastaria para o caminho normal, mas um F5 depois do login
 * faria a pessoa refazer a simulação inteira.
 *
 * ## O preço não sai daqui
 *
 * O que viaja são as **respostas**. O valor é recalculado no servidor, pelo
 * mesmo motor e sobre a mesma tabela publicada — é assim que o snapshot gravado
 * é exatamente o que esta tela exibiu, sem que o navegador possa escolher o
 * número.
 */
export function BotaoDeInteresse({
  prestadorId,
  primeiroNome,
  respostas,
  autenticado,
  onRestaurar,
}: {
  prestadorId: string
  primeiroNome: string
  respostas: RespostasPrecificacao
  /** Vem do servidor. Sessão de verdade, não palpite do navegador. */
  autenticado: boolean
  /** Devolve à página as respostas guardadas antes do login. */
  onRestaurar: (respostas: RespostasPrecificacao) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [intencao, setIntencao] = useState<RespostasPrecificacao | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviada, setEnviada] = useState(false)

  const esquecerIntencao = useCallback(() => {
    setIntencao(null)
    try {
      sessionStorage.removeItem(chaveDaIntencao(prestadorId))
    } catch {
      // Aba anônima com armazenamento bloqueado: o fluxo em memória continua.
    }
  }, [prestadorId])

  // Voltando do login: a simulação que a pessoa tinha na tela é restaurada
  // antes de qualquer coisa, para que ela veja o mesmo preço que decidiu levar
  // adiante.
  useEffect(() => {
    try {
      const guardada = sessionStorage.getItem(chaveDaIntencao(prestadorId))
      if (!guardada) return
      const { respostas: salvas } = JSON.parse(guardada) as {
        respostas: RespostasPrecificacao
      }
      onRestaurar(salvas)
      setIntencao(salvas)
    } catch {
      // Rascunho ilegível não pode quebrar a página: some e a pessoa clica de
      // novo, com a simulação que estiver na tela.
      esquecerIntencao()
    }
    // Só na montagem: depois disso quem manda é o que está na tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enviar = useCallback(
    async (escolhidas: RespostasPrecificacao) => {
      setEnviando(true)
      const resultado = await demonstrarInteresseNaSimulacao({
        prestadorId,
        respostas: escolhidas,
      })
      setEnviando(false)

      if (resultado.sucesso) {
        esquecerIntencao()
        setEnviada(true)
        toast.success(resultado.mensagem)
        // A Área do Cliente é renderizada no servidor.
        router.refresh()
        return
      }

      if (!resultado.precisaEntrar) esquecerIntencao()
      toast.error(resultado.mensagem)
    },
    [prestadorId, esquecerIntencao, router],
  )

  // A sessão existe e havia uma intenção guardada: continua de onde parou.
  useEffect(() => {
    if (!intencao || !autenticado || enviando || enviada) return
    void enviar(intencao)
  }, [intencao, autenticado, enviando, enviada, enviar])

  function clicar() {
    if (autenticado) {
      void enviar(respostas)
      return
    }

    setIntencao(respostas)
    try {
      sessionStorage.setItem(
        chaveDaIntencao(prestadorId),
        JSON.stringify({ respostas }),
      )
    } catch {
      // Sem armazenamento, o estado em memória ainda cobre o caminho normal.
    }

    // `?entrar=1` abre o login sobre esta mesma página, preservando o resto da
    // query — inclusive o `prestador`, sem o qual a página não sabe de quem é.
    const params = new URLSearchParams(searchParams.toString())
    params.set('entrar', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  if (enviada) {
    return (
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Check className="size-4 text-primary" />
          Interesse enviado para {primeiroNome}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ele recebeu a sua simulação e responde por aqui. Acompanhe em
          Solicitações.
        </p>
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <Link href="/cliente?aba=orcamentos">
            Acompanhar <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <Button className="w-full" onClick={clicar} disabled={enviando}>
      {enviando ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Enviando…
        </>
      ) : (
        <>
          Tenho interesse <ArrowRight className="size-4" />
        </>
      )}
    </Button>
  )
}
