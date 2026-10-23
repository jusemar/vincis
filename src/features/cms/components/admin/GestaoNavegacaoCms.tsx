'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  alterarAtivacaoGrupoNavegacaoCms,
  editarItemNavegacaoCms,
  removerItemNavegacaoCms,
  reordenarGruposNavegacaoCms,
  reordenarItensNavegacaoCms,
} from '../../actions/navegacao'
import { ROTULO_STATUS_PAGINA } from '../../constants'
import { chamarAcaoCms } from '../../lib/chamar-acao'
import { localPermiteSubmenu } from '../../nucleo/lib/arvore-navegacao'
import { filtrarPaginasAssociaveis } from '../../nucleo/lib/publicacao'
import type { LocalNavegacao, ResultadoCms } from '../../nucleo/types'
import type {
  GrupoNavegacaoGestaoDTO,
  ItemNavegacaoGestaoDTO,
  PaginaAssociavelDTO,
} from '../../types'
import { FormularioGrupoCms } from './FormularioGrupoCms'
import { FormularioItemCms, type ModoItem } from './FormularioItemCms'

/**
 * Navegação do site — rodapé ou cabeçalho — num componente só.
 *
 * Rodapé: colunas planas de links. Cabeçalho: menu, com agrupadores que abrem
 * submenu (um nível). As regras de árvore são do núcleo e o servidor as
 * confere; aqui a tela só oferece o que faz sentido.
 *
 * Ordenar é por botões de subir e descer — funcionam com toque, teclado e leitor
 * de tela. Cada movimento envia a ordem completa dos irmãos; o servidor só
 * aceita se ela bater com o estado real.
 */
type Modal =
  | { tipo: 'grupo'; grupo?: GrupoNavegacaoGestaoDTO }
  | {
      tipo: 'item'
      grupo: GrupoNavegacaoGestaoDTO
      modo: ModoItem
      item?: ItemNavegacaoGestaoDTO
      paiInicial?: string | null
    }
  | { tipo: 'remover'; item: ItemNavegacaoGestaoDTO }
  | null

const TEXTOS: Record<LocalNavegacao, { explicacao: string; vazio: string }> = {
  rodape: {
    explicacao:
      'Só aparecem no site os grupos ativos, com links ativos para páginas publicadas. Sem nenhum grupo no ar, o rodapé mostra os links fixos atuais.',
    vazio: 'Nenhum grupo ainda. Crie o primeiro — por exemplo “Institucional”.',
  },
  cabecalho: {
    explicacao:
      'Os itens entram no menu do site depois dos links fixos (Início, Profissionais, Parceiros, Preços). Logo, tema e conta não mudam. Agrupador abre um submenu e só aparece com pelo menos um link publicado dentro.',
    vazio: 'Nenhum grupo ainda. Crie um — por exemplo “Menu principal”.',
  },
}

function mover<T>(lista: readonly T[], indice: number, direcao: -1 | 1) {
  const copia = [...lista]
  const [item] = copia.splice(indice, 1)
  copia.splice(indice + direcao, 0, item)
  return copia
}

function textoDoItem(item: ItemNavegacaoGestaoDTO) {
  return item.texto || item.paginaTitulo || 'Sem nome'
}

export function GestaoNavegacaoCms({
  local,
  grupos,
  paginas,
}: {
  local: LocalNavegacao
  grupos: GrupoNavegacaoGestaoDTO[]
  paginas: PaginaAssociavelDTO[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [modal, setModal] = useState<Modal>(null)
  const comSubmenu = localPermiteSubmenu(local)

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

  function aoSalvarModal() {
    setModal(null)
    router.refresh()
  }

  // Função de renderização, e não componente: declarado aqui dentro, um
  // componente seria outro a cada render e o foco do teclado se perderia.
  function linhaItem({
    item,
    irmaos,
    indice,
    grupo,
    filho = false,
  }: {
    item: ItemNavegacaoGestaoDTO
    irmaos: ItemNavegacaoGestaoDTO[]
    indice: number
    grupo: GrupoNavegacaoGestaoDTO
    filho?: boolean
  }) {
    const texto = textoDoItem(item)
    const ehAgrupador = item.paginaId === null
    const ids = irmaos.map(({ id }) => id)
    const reordenar = (direcao: -1 | 1) =>
      executar(() =>
        reordenarItensNavegacaoCms({
          grupoId: grupo.id,
          paiId: item.paiId,
          idsOrdenados: mover(ids, indice, direcao),
        }),
      )

    return (
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            className={`flex items-center gap-2 truncate text-sm font-medium ${item.ativo ? '' : 'text-muted-foreground line-through'}`}
          >
            {ehAgrupador && <FolderTree aria-hidden className="size-4 shrink-0 text-primary" />}
            <span className="truncate">{texto}</span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {ehAgrupador ? (
              <span>Agrupador · abre submenu</span>
            ) : (
              <span className="truncate">/{item.paginaSlug}</span>
            )}
            {item.paginaStatus && item.paginaStatus !== 'publicada' && (
              <Badge variant="outline">{ROTULO_STATUS_PAGINA[item.paginaStatus]} — fora do site</Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <Switch
            checked={item.ativo}
            disabled={pendente}
            aria-label={`Exibir ${filho ? 'o subitem' : 'o item'} ${texto} no site`}
            className="mr-2"
            onCheckedChange={(ativo) =>
              executar(() => editarItemNavegacaoCms({ itemId: item.id, texto: item.texto, ativo }))
            }
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Subir ${texto}`}
            disabled={pendente || indice === 0}
            onClick={() => reordenar(-1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Descer ${texto}`}
            disabled={pendente || indice === irmaos.length - 1}
            onClick={() => reordenar(1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Editar ${texto}`}
            disabled={pendente}
            onClick={() =>
              setModal({ tipo: 'item', grupo, modo: ehAgrupador ? 'agrupador' : 'link', item })
            }
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remover ${texto} da navegação`}
            disabled={pendente}
            onClick={() => setModal({ tipo: 'remover', item })}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{TEXTOS[local].explicacao}</p>
        <Button type="button" className="shrink-0" onClick={() => setModal({ tipo: 'grupo' })}>
          <Plus className="size-4" />
          Novo grupo
        </Button>
      </div>

      {grupos.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {TEXTOS[local].vazio}
        </p>
      )}

      <ol className="space-y-4">
        {grupos.map((grupo, indiceGrupo) => {
          const idsGrupos = grupos.map(({ id }) => id)
          const raizes = grupo.itens.filter((item) => !item.paiId)
          const agrupadores = comSubmenu ? raizes.filter((item) => item.paginaId === null) : []
          const disponiveis = filtrarPaginasAssociaveis(
            paginas,
            grupo.itens.flatMap(({ paginaId }) => (paginaId ? [paginaId] : [])),
          )
          return (
            <li key={grupo.id}>
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{grupo.tituloPublico}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {grupo.nome} · {grupo.identificador}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="alvo-toque-h mr-2 flex items-center gap-2 text-sm">
                        <Switch
                          checked={grupo.ativo}
                          disabled={pendente}
                          aria-label={`Exibir o grupo ${grupo.tituloPublico} no site`}
                          onCheckedChange={(ativo) =>
                            executar(() => alterarAtivacaoGrupoNavegacaoCms({ grupoId: grupo.id, ativo }))
                          }
                        />
                        {grupo.ativo ? 'Ativo' : 'Inativo'}
                      </label>
                      {([-1, 1] as const).map((direcao) => (
                        <Button
                          key={direcao}
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`${direcao < 0 ? 'Subir' : 'Descer'} o grupo ${grupo.tituloPublico}`}
                          disabled={
                            pendente ||
                            (direcao < 0 ? indiceGrupo === 0 : indiceGrupo === grupos.length - 1)
                          }
                          onClick={() =>
                            executar(() =>
                              reordenarGruposNavegacaoCms({
                                local,
                                idsOrdenados: mover(idsGrupos, indiceGrupo, direcao),
                              }),
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
                        aria-label={`Editar o grupo ${grupo.tituloPublico}`}
                        disabled={pendente}
                        onClick={() => setModal({ tipo: 'grupo', grupo })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {raizes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem itens neste grupo.</p>
                  ) : (
                    <ol className="divide-y divide-border rounded-lg border border-border">
                      {raizes.map((raiz, indice) => {
                        const filhos = grupo.itens.filter((item) => item.paiId === raiz.id)
                        const ehAgrupador = comSubmenu && raiz.paginaId === null
                        return (
                          <li key={raiz.id}>
                            {linhaItem({ item: raiz, irmaos: raizes, indice, grupo })}
                            {ehAgrupador && (
                              <div className="space-y-2 pb-3 pl-6 pr-3">
                                {filhos.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Submenu vazio — o agrupador não aparece no site até ter um link
                                    publicado dentro.
                                  </p>
                                ) : (
                                  <ol
                                    aria-label={`Submenu de ${textoDoItem(raiz)}`}
                                    className="divide-y divide-border rounded-lg border border-dashed border-border"
                                  >
                                    {filhos.map((filho, indiceFilho) => (
                                      <li key={filho.id}>
                                        {linhaItem({
                                          item: filho,
                                          irmaos: filhos,
                                          indice: indiceFilho,
                                          grupo,
                                          filho: true,
                                        })}
                                      </li>
                                    ))}
                                  </ol>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={pendente}
                                  onClick={() =>
                                    setModal({ tipo: 'item', grupo, modo: 'link', paiInicial: raiz.id })
                                  }
                                >
                                  <Plus className="size-4" />
                                  Adicionar página ao submenu
                                </Button>
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ol>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pendente}
                      onClick={() => setModal({ tipo: 'item', grupo, modo: 'link' })}
                    >
                      <Plus className="size-4" />
                      Adicionar página
                    </Button>
                    {comSubmenu && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pendente}
                        onClick={() => setModal({ tipo: 'item', grupo, modo: 'agrupador' })}
                      >
                        <FolderTree className="size-4" />
                        Adicionar agrupador
                      </Button>
                    )}
                  </div>

                  {modal?.tipo === 'item' && modal.grupo.id === grupo.id && (
                    <FormularioItemCms
                      aberto
                      aoFechar={() => setModal(null)}
                      aoSalvar={aoSalvarModal}
                      grupoId={grupo.id}
                      modo={modal.modo}
                      item={modal.item}
                      paiInicial={modal.paiInicial}
                      paginasDisponiveis={disponiveis}
                      agrupadores={agrupadores}
                    />
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ol>

      {modal?.tipo === 'grupo' && (
        <FormularioGrupoCms
          aberto
          aoFechar={() => setModal(null)}
          aoSalvar={aoSalvarModal}
          grupo={modal.grupo}
          local={local}
        />
      )}

      {modal?.tipo === 'remover' && (
        <ModalResponsivo
          aberto
          onFechar={() => !pendente && setModal(null)}
          titulo="Remover da navegação?"
          descricao={textoDoItem(modal.item)}
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
                  executar(() => removerItemNavegacaoCms({ itemId: modal.item.id }), () => setModal(null))
                }
              >
                {pendente ? 'Removendo…' : 'Remover'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted-foreground">
            Só o link sai do menu. A página continua existindo e pode ser vinculada de novo. Para
            tirar do site sem perder a posição, use o interruptor.
          </p>
        </ModalResponsivo>
      )}
    </div>
  )
}
