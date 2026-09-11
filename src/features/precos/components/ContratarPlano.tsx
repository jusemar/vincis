'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Check, Info } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { contratarPlanoVincis } from '@/features/assinaturas/actions/contratar-plano'
import { formatarCentavos } from '@/features/precificacao/lib/formato'
import type {
  PrecoPeriodo,
  RespostasPrecificacao,
} from '@/features/precificacao/types/precificacao'
import type { ServicoTab } from '../types'

/**
 * Onde a intenção de contratar fica enquanto a pessoa entra na conta.
 *
 * Em `sessionStorage`, como o interesse numa tabela individual: é rascunho de
 * uma aba, não dado da pessoa. Fecha a aba, some — o comportamento certo para
 * "eu ia clicar em Contratar". Guarda **escolhas**, nunca preço: o valor é
 * recalculado no servidor na hora de confirmar.
 */
const CHAVE_INTENCAO = 'vincis:contratacao-plano'
const ABAS: ServicoTab[] = ['consultiva', 'juridico', 'combo']

export type IntencaoDeContratacao = {
  tab: ServicoTab
  planoCodigo: string
  periodoCodigo: string
  respostas: RespostasPrecificacao
}

/** A intenção guardada, se houver e se for legível. Nunca lança. */
export function lerIntencaoGuardada(): IntencaoDeContratacao | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_INTENCAO)
    if (!bruto) return null
    const salva = JSON.parse(bruto) as Partial<IntencaoDeContratacao>
    if (
      !salva.tab ||
      !ABAS.includes(salva.tab) ||
      !salva.planoCodigo ||
      !salva.periodoCodigo ||
      !salva.respostas
    ) {
      esquecerIntencaoGuardada()
      return null
    }
    return salva as IntencaoDeContratacao
  } catch {
    // Rascunho ilegível não pode quebrar a vitrine: some, e a pessoa clica de
    // novo com a simulação que estiver na tela.
    esquecerIntencaoGuardada()
    return null
  }
}

export function esquecerIntencaoGuardada() {
  try {
    sessionStorage.removeItem(CHAVE_INTENCAO)
  } catch {
    // Armazenamento bloqueado: não havia o que esquecer.
  }
}

function guardarIntencao(intencao: IntencaoDeContratacao) {
  try {
    sessionStorage.setItem(CHAVE_INTENCAO, JSON.stringify(intencao))
  } catch {
    // Sem armazenamento, a pessoa refaz a escolha depois de entrar.
  }
}

/**
 * O botão "Contratar" de um plano da Vincis.
 *
 * ## Contratar a Vincis, não um profissional
 *
 * O que ele registra é um contrato do cliente **com a plataforma**. Não abre
 * conversa com ninguém e não cria oportunidade: é outro caminho, com outra
 * tabela, e por isso mora aqui e não perto do "Tenho interesse" das tabelas
 * individuais.
 *
 * ## Entrar no meio do caminho não perde a escolha
 *
 * Quem não está autenticado não sai da página: a escolha fica guardada e o
 * login abre **por cima** de `/precos`, com o `?entrar=1` que a plataforma
 * inteira usa. Na volta, a vitrine restaura aba, respostas, plano e prazo, e o
 * diálogo de confirmação reabre — a pessoa confirma de novo, com o preço à
 * vista. Retomar não é contratar sozinho: dinheiro exige um "sim" explícito.
 *
 * ## O que a tela diz depois
 *
 * "Contratação registrada. O pagamento ainda não está disponível neste
 * ambiente." Nada sugere pagamento feito, porque não houve.
 */
export function ContratarPlano({
  planoCodigo,
  planoNome,
  periodo,
  respostas,
  tab,
  autenticado,
  retomar,
  onRetomada,
  rotulo,
  variante = 'default',
}: {
  planoCodigo: string
  planoNome: string
  /** O prazo escolhido no card. Só o código dele viaja ao servidor. */
  periodo: PrecoPeriodo
  respostas: RespostasPrecificacao
  tab: ServicoTab
  /** Sessão lida no servidor, não palpite do navegador. */
  autenticado: boolean
  /** Este é o plano que a pessoa ia contratar antes de entrar na conta. */
  retomar: boolean
  /** Avisa a vitrine que a retomada foi atendida ou dispensada. */
  onRetomada: () => void
  rotulo: string
  variante?: React.ComponentProps<typeof Button>['variant']
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [abertoManual, setAbertoManual] = useState(false)
  /*
    A pessoa clicou sem sessão e foi entrar sem sair da página.

    O login acontece por cima de `/precos`, então este card continua montado: o
    que muda é a sessão, que chega de novo pelo servidor. Guardar aqui que ela
    estava a caminho de contratar é o que faz a confirmação reabrir quando
    `autenticado` vira verdade. A retomada pelo `sessionStorage` cobre o outro
    caso — a página recarregou no meio do caminho.
  */
  const [aguardandoLogin, setAguardandoLogin] = useState(false)
  const [registrada, setRegistrada] = useState(false)
  const [enviando, iniciarEnvio] = useTransition()

  // Derivado, não efeito: voltou autenticado com a intenção, a confirmação abre.
  const aberto =
    abertoManual || ((retomar || aguardandoLogin) && autenticado && !registrada)

  function irParaLogin() {
    setAguardandoLogin(true)
    guardarIntencao({ tab, planoCodigo, periodoCodigo: periodo.periodo, respostas })
    // O resto da query fica; o modal de entrada tira só o `entrar` ao fechar.
    const params = new URLSearchParams(window.location.search)
    params.set('entrar', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clicar() {
    if (autenticado) {
      setAbertoManual(true)
      return
    }
    irParaLogin()
  }

  function fechar() {
    setAbertoManual(false)
    // Desistiu de contratar: a intenção guardada não pode reabrir o diálogo.
    if (retomar || aguardandoLogin) {
      setAguardandoLogin(false)
      esquecerIntencaoGuardada()
      if (retomar) onRetomada()
    }
  }

  function confirmar() {
    iniciarEnvio(async () => {
      const resultado = await contratarPlanoVincis({
        planoCodigo,
        periodoCodigo: periodo.periodo,
        respostas,
      })

      if (resultado.sucesso) {
        esquecerIntencaoGuardada()
        setAbertoManual(false)
        setAguardandoLogin(false)
        setRegistrada(true)
        if (retomar) onRetomada()
        toast.success(resultado.mensagem)
        router.refresh()
        return
      }

      if (resultado.precisaEntrar) {
        // A sessão caiu entre abrir e confirmar: volta ao login sem perder nada.
        setAbertoManual(false)
        irParaLogin()
        return
      }

      esquecerIntencaoGuardada()
      toast.error(resultado.mensagem)
    })
  }

  if (registrada) {
    return (
      <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Check className="size-4 text-primary" aria-hidden />
          Contratação registrada
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {planoNome} · {periodo.rotulo}. O pagamento ainda não está disponível
          neste ambiente — sua contratação fica registrada aguardando pagamento.
        </p>
      </div>
    )
  }

  return (
    <>
      <Button className="mt-4 w-full" variant={variante} onClick={clicar}>
        {rotulo} <ArrowRight className="size-4" aria-hidden />
      </Button>

      <AlertDialog
        open={aberto}
        onOpenChange={(abrir) => {
          if (!abrir) fechar()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contratar {planoNome}</AlertDialogTitle>
            <AlertDialogDescription>
              Confira o que você está contratando da Vincis.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="space-y-2 rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Prazo</dt>
              <dd className="font-medium">
                {/* O rótulo da tabela costuma já dizer a duração ("6 meses");
                    só completa quando não disser, para nunca repetir. */}
                {periodo.meses > 1 && !periodo.rotulo.includes(String(periodo.meses))
                  ? `${periodo.rotulo} · ${periodo.meses} meses`
                  : periodo.rotulo}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Valor mensal</dt>
              <dd className="font-medium tabular-nums">
                {formatarCentavos(periodo.mensalCentavos)}/mês
              </dd>
            </div>
            {periodo.descontoMilesimos > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Desconto do prazo</dt>
                <dd className="font-medium tabular-nums text-primary">
                  {periodo.descontoPercentual.toLocaleString('pt-BR')}%
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t pt-2">
              <dt className="font-medium">Total do período</dt>
              <dd className="font-semibold tabular-nums">
                {formatarCentavos(periodo.totalPeriodoCentavos)}
              </dd>
            </div>
          </dl>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            O pagamento ainda não está disponível neste ambiente. Ao confirmar,
            a contratação fica registrada aguardando pagamento.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evento) => {
                // O diálogo fecharia sozinho; ele espera a resposta do servidor.
                evento.preventDefault()
                confirmar()
              }}
              disabled={enviando}
            >
              {enviando ? 'Registrando…' : 'Confirmar contratação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
