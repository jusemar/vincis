'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  alterarAtivacaoCardHomeCms,
  excluirCardHomeCms,
  reordenarCardsHomeCms,
} from '../../actions/cards-home'
import { ROTULO_ESTILO_CARD_HOME, rotuloRotaInterna } from '../../integracao/cards-home/constantes'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import type { ResultadoCms } from '../../nucleo/types'
import type { CardHomeGestaoDTO, PaginaAssociavelDTO } from '../../types'
import { FormularioCardHomeCms } from './FormularioCardHomeCms'

/**
 * Cards da Home: a seção de serviços da página inicial.
 *
 * Ordenar é por botões de subir e descer (toque, teclado e leitor de tela).
 * Cada movimento envia a ordem completa; o servidor só aceita se ela bater com
 * o estado real. O primeiro card ativo é o destacado na Home.
 *
 * Excluir pede confirmação e só fica disponível para card desativado — tirar
 * do ar e apagar são dois gestos. A exclusão é lógica (fica na auditoria).
 */
type Modal = { tipo: 'card'; card?: CardHomeGestaoDTO } | { tipo: 'excluir'; card: CardHomeGestaoDTO } | null

function mover<T>(lista: readonly T[], indice: number, direcao: -1 | 1) {
  const copia = [...lista]
  const [item] = copia.splice(indice, 1)
  copia.splice(indice + direcao, 0, item)
  return copia
}

function tituloEmUmaLinha(card: CardHomeGestaoDTO) {
  return card.titulo.replace(/\n/g, ' ')
}

function descricaoDestino(card: CardHomeGestaoDTO) {
  if (card.destinoTipo === 'rota')
    return `${rotuloRotaInterna(card.rota ?? '') ?? 'Rota fora da lista'} · ${card.rota ?? ''}`
  return `Página do CMS: ${card.paginaTitulo ?? 'não encontrada'}${card.paginaSlug ? ` · /${card.paginaSlug}` : ''}`
}

export function GestaoCardsHomeCms({
  cards,
  paginas,
}: {
  cards: CardHomeGestaoDTO[]
  paginas: PaginaAssociavelDTO[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [modal, setModal] = useState<Modal>(null)
  const ids = cards.map(({ id }) => id)
  // O destaque da Home é o primeiro card que de fato aparece no site.
  const idDestaque = cards.find((card) => card.ativo && card.href)?.id

  function executar(acao: () => Promise<ResultadoCms<unknown>>, aoConcluir?: () => void) {
    iniciar(async () => {
      const resultado = await chamarAcaoCms(acao)
      if (!resultado.sucesso) toast.error(resultado.mensagem)
      else {
        toast.success(resultado.mensagem)
        aoConcluir?.()
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Cards de serviço da página inicial. Só os ativos, com destino no ar, aparecem no site — na
          ordem desta lista. O primeiro fica em destaque à esquerda.
        </p>
        <Button type="button" className="shrink-0" onClick={() => setModal({ tipo: 'card' })}>
          <Plus className="size-4" />
          Novo card
        </Button>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum card. Sem cards ativos, a seção de serviços não aparece na Home.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ol aria-label="Cards da Home, na ordem de exibição" className="divide-y divide-border">
              {cards.map((card, indice) => {
                const titulo = tituloEmUmaLinha(card)
                return (
                  <li
                    key={card.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground tabular-nums">{indice + 1}.</span>
                        <p className={`truncate font-medium ${card.ativo ? '' : 'text-muted-foreground'}`}>
                          {titulo}
                        </p>
                        {card.id === idDestaque && <Badge>Destaque</Badge>}
                        <Badge variant={card.ativo ? 'secondary' : 'outline'}>
                          {card.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {!card.href && <Badge variant="destructive">Destino fora do ar</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {card.selo ? `${card.selo} · ` : ''}
                        Estilo: {ROTULO_ESTILO_CARD_HOME[card.estilo]}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <ExternalLink aria-hidden className="size-3 shrink-0" />
                        <span className="truncate">{descricaoDestino(card)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <Switch
                        checked={card.ativo}
                        disabled={pendente}
                        aria-label={`Exibir o card ${titulo} na Home`}
                        className="mr-2"
                        onCheckedChange={(ativo) =>
                          executar(() => alterarAtivacaoCardHomeCms({ cardId: card.id, ativo }))
                        }
                      />
                      {([-1, 1] as const).map((direcao) => (
                        <Button
                          key={direcao}
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`${direcao < 0 ? 'Subir' : 'Descer'} o card ${titulo}`}
                          disabled={pendente || (direcao < 0 ? indice === 0 : indice === cards.length - 1)}
                          onClick={() =>
                            executar(() =>
                              reordenarCardsHomeCms({ idsOrdenados: mover(ids, indice, direcao) }),
                            )
                          }
                        >
                          {direcao < 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar o card ${titulo}`}
                        disabled={pendente}
                        onClick={() => setModal({ tipo: 'card', card })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={
                          card.ativo
                            ? `Excluir o card ${titulo} (desative antes)`
                            : `Excluir o card ${titulo}`
                        }
                        title={card.ativo ? 'Desative o card antes de excluir' : 'Excluir'}
                        disabled={pendente || card.ativo}
                        onClick={() => setModal({ tipo: 'excluir', card })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {modal?.tipo === 'card' && (
        <FormularioCardHomeCms
          card={modal.card}
          paginas={paginas}
          aoFechar={() => setModal(null)}
          aoSalvar={() => {
            setModal(null)
            router.refresh()
          }}
        />
      )}

      {modal?.tipo === 'excluir' && (
        <ModalResponsivo
          aberto
          onFechar={() => !pendente && setModal(null)}
          titulo="Excluir card?"
          descricao={tituloEmUmaLinha(modal.card)}
          largura="md"
          rodape={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={pendente} onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pendente}
                onClick={() =>
                  executar(
                    () => excluirCardHomeCms({ cardId: modal.card.id, confirmacao: true }),
                    () => setModal(null),
                  )
                }
              >
                {pendente ? 'Excluindo…' : 'Excluir card'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">
            O card sai desta lista e não pode voltar por aqui. Para só tirá-lo do site, use o
            interruptor. A exclusão fica registrada na auditoria.
          </p>
        </ModalResponsivo>
      )}
    </div>
  )
}
