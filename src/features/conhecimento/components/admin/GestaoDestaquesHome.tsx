'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { definirArtigoNoCardHome } from '../../actions/destaques-home'
import type { CardParaDestaque } from '../../queries/destaques-home'

/**
 * Cards da Home × artigos da Central (Gestão). O desenho dos cards não muda:
 * escolher um artigo troca só o conteúdo exibido; "Restaurar" volta ao
 * original. Artigo que sair do ar devolve o card sozinho.
 */
export function GestaoDestaquesHome({
  cards,
  artigos,
}: {
  cards: CardParaDestaque[]
  artigos: { id: string; titulo: string; categoria: string | null }[]
}) {
  return (
    <section className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Escolha um artigo publicado para aparecer no lugar do conteúdo de um card da Home (mesmo desenho e cor). O card
        mostra categoria, título, resumo e “Ler artigo”. Se o artigo for despublicado ou arquivado, o card volta
        automaticamente ao conteúdo original — que continua guardado e editável em Conteúdo do site.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/" target="_blank" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          Ver a Home <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>
      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nenhum card cadastrado na Home.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-3">
          {cards.map((card, indice) => (
            <li key={card.cardId}>
              <CardDestaque card={card} posicao={indice + 1} artigos={artigos} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CardDestaque({
  card,
  posicao,
  artigos,
}: {
  card: CardParaDestaque
  posicao: number
  artigos: { id: string; titulo: string; categoria: string | null }[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [escolhido, setEscolhido] = useState(card.artigoId ?? '')

  function salvar(artigoId: string | null) {
    iniciar(async () => {
      const resposta = await definirArtigoNoCardHome({ cardId: card.cardId, artigoId })
      if (!resposta.sucesso) toast.error(resposta.mensagem)
      else {
        toast.success(resposta.mensagem)
        if (!artigoId) setEscolhido('')
        router.refresh()
      }
    })
  }

  const idCampo = `artigo-card-${card.cardId}`
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Card {posicao}
          {!card.ativo ? ' · desativado no CMS' : ''}
        </p>
        <p className="mt-1 whitespace-pre-line font-semibold text-foreground">{card.tituloOriginal}</p>
        {card.seloOriginal ? <p className="text-xs text-muted-foreground">Selo original: {card.seloOriginal}</p> : null}
      </div>

      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
        {card.artigoId ? (
          card.artigoNoAr ? (
            <>
              Exibindo: <strong>{card.artigoTitulo}</strong>
            </>
          ) : (
            <>Artigo escolhido fora do ar — o card está mostrando o conteúdo original.</>
          )
        ) : (
          'Exibindo o conteúdo original.'
        )}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={idCampo}>Artigo publicado</Label>
        <select
          id={idCampo}
          value={escolhido}
          disabled={pendente || artigos.length === 0}
          onChange={(evento) => setEscolhido(evento.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{artigos.length ? 'Escolha um artigo' : 'Nenhum artigo publicado'}</option>
          {artigos.map((artigo) => (
            <option key={artigo.id} value={artigo.id}>
              {artigo.categoria ? `[${artigo.categoria}] ` : ''}
              {artigo.titulo}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pendente || !escolhido || escolhido === card.artigoId} onClick={() => salvar(escolhido)}>
          {card.artigoId ? 'Trocar artigo' : 'Exibir artigo'}
        </Button>
        {card.artigoId ? (
          <Button type="button" size="sm" variant="outline" className="gap-1" disabled={pendente} onClick={() => salvar(null)}>
            <RotateCcw className="size-3.5" aria-hidden /> Restaurar original
          </Button>
        ) : null}
      </div>
    </div>
  )
}
