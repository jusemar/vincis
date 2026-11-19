'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Home, Info, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { definirArtigoNoCardHome } from '../../../actions/destaques-home'
import { ROTA_GESTAO_CONHECIMENTO } from '../../../constants/rotas'
import type { CardParaDestaque, PainelCardsHomeDoArtigo } from '../../../queries/destaques-home'

/**
 * "Exibir nos cards da Home" dentro do editor do artigo (só para o Gestor).
 *
 * Não é um destaque novo: usa os mesmos três cards da Home, a mesma tabela e a
 * mesma action da aba "Cards da Home" — as duas telas mostram sempre o mesmo
 * estado. O servidor confere permissão e publicação de novo a cada clique.
 */
export function SecaoCardsHome({ painel }: { painel: PainelCardsHomeDoArtigo }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const { artigoId, artigoPublicado, cards } = painel
  const cardAtual = artigoId ? cards.find((card) => card.artigoId === artigoId) : undefined
  const disponivel = Boolean(artigoId && artigoPublicado)

  function exibirNoCard(card: CardParaDestaque, posicao: number) {
    if (!artigoId) return
    // Substituir outro artigo ou mover este de card pede confirmação explícita.
    const ocupadoPorOutro = card.artigoId && card.artigoId !== artigoId
    if (ocupadoPorOutro) {
      const nome = card.artigoTitulo ? `“${card.artigoTitulo}”` : 'o artigo atual'
      if (!window.confirm(`O card ${posicao} exibe ${nome}. Substituir pelo artigo que você está editando?`)) return
    }
    if (cardAtual && cardAtual.cardId !== card.cardId) {
      if (!window.confirm(`Este artigo sairá do card ${cards.indexOf(cardAtual) + 1}, que volta ao conteúdo original. Continuar?`)) return
    }
    iniciar(async () => {
      const resposta = await definirArtigoNoCardHome({ cardId: card.cardId, artigoId, liberarCardAnterior: true })
      if (!resposta.sucesso) toast.error(resposta.mensagem)
      else {
        toast.success(resposta.mensagem)
        router.refresh()
      }
    })
  }

  function retirarDaHome(card: CardParaDestaque) {
    iniciar(async () => {
      const resposta = await definirArtigoNoCardHome({ cardId: card.cardId, artigoId: null })
      if (!resposta.sucesso) toast.error(resposta.mensagem)
      else {
        toast.success('Artigo retirado da Home. O card voltou ao conteúdo original.')
        router.refresh()
      }
    })
  }

  return (
    <section
      aria-labelledby="titulo-cards-home"
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <header>
        <h2 id="titulo-cards-home" className="flex items-center gap-2 text-base font-bold text-foreground">
          <Home className="size-4 text-primary" aria-hidden /> Exibir nos cards da Home
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          O artigo ocupa um dos três cards de serviços da página inicial (mesmo desenho) com categoria, título, resumo e
          “Ler artigo”. Retirar devolve o conteúdo original do card.
        </p>
      </header>

      {cardAtual ? (
        <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {cardAtual.artigoNoAr ? (
            <>
              Este artigo está no <strong>card {cards.indexOf(cardAtual) + 1}</strong> da Home.
            </>
          ) : (
            <>
              Este artigo está escolhido para o <strong>card {cards.indexOf(cardAtual) + 1}</strong>, mas está fora do ar
              — o card mostra o conteúdo original até ele voltar a ser publicado.
            </>
          )}
        </p>
      ) : null}

      {!disponivel ? (
        <p className="flex gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {artigoId
            ? 'Indisponível: só artigos publicados podem ocupar os cards da Home. Publique o artigo para escolher um card.'
            : 'Indisponível: salve e publique o artigo para escolher um card da Home.'}
        </p>
      ) : null}

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum card cadastrado na Home.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {cards.map((card, indice) => {
            const posicao = indice + 1
            const ehEste = Boolean(artigoId && card.artigoId === artigoId)
            return (
              <li
                key={card.cardId}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3 text-sm',
                  ehEste ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Card {posicao}
                  {!card.ativo ? ' · desativado' : ''}
                </p>
                <p className="whitespace-pre-line font-semibold leading-snug text-foreground">{card.tituloOriginal}</p>
                <p className="text-xs text-muted-foreground">
                  {ehEste ? (
                    <strong className="text-primary">Exibindo este artigo</strong>
                  ) : card.artigoId && card.artigoNoAr ? (
                    <>
                      Exibindo: <span className="text-foreground">{card.artigoTitulo}</span>
                    </>
                  ) : card.artigoId ? (
                    'Artigo escolhido fora do ar — mostra o original'
                  ) : (
                    'Conteúdo original'
                  )}
                </p>
                <div className="mt-auto pt-1">
                  {ehEste ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1"
                      disabled={pendente}
                      onClick={() => retirarDaHome(card)}
                    >
                      <RotateCcw className="size-3.5" aria-hidden /> Retirar e restaurar original
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full"
                      variant={card.artigoId && card.artigoNoAr ? 'outline' : 'default'}
                      disabled={pendente || !disponivel}
                      onClick={() => exibirNoCard(card, posicao)}
                    >
                      {card.artigoId && card.artigoNoAr ? 'Substituir por este' : 'Exibir neste card'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/" target="_blank" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          Ver a Home <ExternalLink className="size-3.5" aria-hidden />
        </Link>
        <Link href={`${ROTA_GESTAO_CONHECIMENTO}?aba=home`} className="font-semibold text-primary hover:underline">
          Todos os cards da Home
        </Link>
      </div>
    </section>
  )
}
