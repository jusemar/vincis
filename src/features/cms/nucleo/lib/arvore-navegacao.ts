import { LOCAIS_COM_SUBMENU, PROFUNDIDADE_MAXIMA_SUBMENU } from '../schemas/constantes'
import type { LocalNavegacao } from '../types'
import type { VerificadorSlugReservado } from './slugs-reservados'

/**
 * Regras da árvore de navegação: posição válida de um item e montagem do menu.
 *
 * Um item é **link** (aponta para uma página) ou **agrupador** (sem página, só
 * abre um submenu). Agrupador e submenu existem só nos locais que os aceitam
 * (`LOCAIS_COM_SUBMENU`); nos outros a lista é plana.
 *
 * Num local com submenu:
 * - raiz pode ser link ou agrupador;
 * - filho é sempre link, e o pai é sempre um agrupador raiz do mesmo grupo;
 * - um nível só (`PROFUNDIDADE_MAXIMA_SUBMENU`): agrupador não vira filho de
 *   ninguém, e filho não tem filhos.
 *
 * Separar "abre submenu" de "leva a uma página" é o padrão de navegação por
 * *disclosure*: o botão que expande não navega, e o teclado e o leitor de tela
 * sabem o que cada controle faz.
 */
export type NoArvore = {
  id: string
  grupoId: string
  paiId: string | null
  paginaId: string | null
}

export type ErroPosicaoItem =
  | 'agrupador_fora_de_menu'
  | 'submenu_nao_permitido'
  | 'auto_referencia'
  | 'pai_inexistente'
  | 'pai_de_outro_grupo'
  | 'pai_nao_agrupador'
  | 'profundidade_excedida'
  | 'filho_sem_pagina'
  | 'ciclo'

export const MENSAGEM_ERRO_POSICAO: Record<ErroPosicaoItem, string> = {
  agrupador_fora_de_menu: 'Item sem página (agrupador) só existe no cabeçalho.',
  submenu_nao_permitido: 'Este local não tem submenu.',
  auto_referencia: 'Um item não pode ser pai de si mesmo.',
  pai_inexistente: 'O item pai não existe.',
  pai_de_outro_grupo: 'O item pai precisa ser do mesmo grupo.',
  pai_nao_agrupador: 'Só um agrupador (item sem página) pode ter submenu.',
  profundidade_excedida: 'O menu tem um nível de submenu só: não há submenu dentro de submenu.',
  filho_sem_pagina: 'Item de submenu precisa apontar para uma página.',
  ciclo: 'Essa posição criaria um ciclo no menu.',
}

export function localPermiteSubmenu(local: LocalNavegacao) {
  return LOCAIS_COM_SUBMENU.includes(local)
}

/** O pai proposto já está, direta ou indiretamente, abaixo do próprio item? */
export function criariaCiclo(
  itemId: string,
  paiId: string | null,
  paiDe: (id: string) => string | null | undefined,
) {
  const visitados = new Set<string>()
  for (let atual = paiId; atual; atual = paiDe(atual) ?? null) {
    if (atual === itemId || visitados.has(atual)) return true
    visitados.add(atual)
  }
  return false
}

/**
 * A posição proposta para um item é válida?
 *
 * `itens` é o conjunto atual do grupo (para achar o pai, os filhos do item e
 * percorrer ancestrais). `item.id` é opcional: um item novo ainda não existe.
 */
export function validarPosicaoItem({
  item,
  paiId,
  local,
  itens,
}: {
  item: { id?: string; grupoId: string; paginaId: string | null }
  paiId: string | null
  local: LocalNavegacao
  itens: readonly NoArvore[]
}): ErroPosicaoItem | null {
  const permiteSubmenu = localPermiteSubmenu(local)
  const temFilhos = item.id ? itens.some((outro) => outro.paiId === item.id) : false

  if (!paiId) {
    if (!item.paginaId && !permiteSubmenu) return 'agrupador_fora_de_menu'
    return null
  }

  if (!permiteSubmenu) return 'submenu_nao_permitido'
  if (item.id && paiId === item.id) return 'auto_referencia'
  const pai = itens.find((outro) => outro.id === paiId)
  if (!pai) return 'pai_inexistente'
  if (pai.grupoId !== item.grupoId) return 'pai_de_outro_grupo'
  if (
    item.id &&
    criariaCiclo(item.id, paiId, (id) => itens.find((outro) => outro.id === id)?.paiId)
  )
    return 'ciclo'
  if (profundidade(pai, itens) + 1 > PROFUNDIDADE_MAXIMA_SUBMENU || temFilhos)
    return 'profundidade_excedida'
  if (pai.paginaId) return 'pai_nao_agrupador'
  if (!item.paginaId) return 'filho_sem_pagina'
  return null
}

/** Nível do item na árvore: 0 para raiz. */
function profundidade(item: NoArvore, itens: readonly NoArvore[]) {
  let nivel = 0
  const visitados = new Set<string>()
  for (let atual = item.paiId; atual && !visitados.has(atual); nivel += 1) {
    visitados.add(atual)
    atual = itens.find((outro) => outro.id === atual)?.paiId ?? null
  }
  return nivel
}

/** Irmãos de um item: mesmo grupo, mesmo pai. É o conjunto que se reordena. */
export function irmaos<T extends NoArvore>(itens: readonly T[], grupoId: string, paiId: string | null) {
  return itens.filter((item) => item.grupoId === grupoId && item.paiId === paiId)
}

// ---------------------------------------------------------------------------
// Montagem pública

export type LinhaMenuPublico = {
  grupoId: string
  grupoTitulo: string
  grupoOrdem: number
  itemId: string
  paiId: string | null
  itemOrdem: number
  texto: string | null
  /** Sem página vinculada: só abre submenu. */
  ehAgrupador: boolean
  /** Nulo para agrupador e para página que não está publicada. */
  paginaSlug: string | null
  paginaTitulo: string | null
}

export type ItemMenuPublico = {
  id: string
  texto: string
  /** `null` num agrupador: ele só abre o submenu. */
  href: string | null
  filhos: ItemMenuPublico[]
}

export type GrupoMenuPublico = { id: string; titulo: string; itens: ItemMenuPublico[] }

/**
 * Linhas → menu pronto para desenhar, na ordem.
 *
 * A consulta já traz só grupo ativo e item ativo, e a página só quando
 * publicada. Aqui ficam as regras de visibilidade que dependem da árvore:
 * - link sem página publicada (ou com slug reservado) não aparece;
 * - filho cujo pai não veio (desligado) não aparece;
 * - agrupador sem nenhum filho visível não aparece;
 * - grupo sem nenhum item visível não aparece.
 */
export function montarMenuPublico(
  linhas: readonly LinhaMenuPublico[],
  slugReservado: VerificadorSlugReservado,
): GrupoMenuPublico[] {
  const porOrdem = (a: LinhaMenuPublico, b: LinhaMenuPublico) =>
    a.itemOrdem - b.itemOrdem || a.itemId.localeCompare(b.itemId)

  const link = (linha: LinhaMenuPublico): ItemMenuPublico | null =>
    linha.paginaSlug && !slugReservado(linha.paginaSlug)
      ? {
          id: linha.itemId,
          texto: linha.texto?.trim() || linha.paginaTitulo || linha.paginaSlug,
          href: `/${linha.paginaSlug}`,
          filhos: [],
        }
      : null

  const grupos = [...new Map(linhas.map((linha) => [linha.grupoId, linha])).values()].sort(
    (a, b) => a.grupoOrdem - b.grupoOrdem || a.grupoId.localeCompare(b.grupoId),
  )

  return grupos
    .map((grupo) => {
      const doGrupo = linhas.filter((linha) => linha.grupoId === grupo.grupoId)
      const itens = doGrupo
        .filter((linha) => !linha.paiId)
        .sort(porOrdem)
        .map((raiz): ItemMenuPublico | null => {
          const filhos = doGrupo
            .filter((linha) => linha.paiId === raiz.itemId)
            .sort(porOrdem)
            .map((filho) => (filho.ehAgrupador ? null : link(filho)))
            .filter((item): item is ItemMenuPublico => item !== null)
          // Raiz com página é link; sem página é agrupador e vive dos filhos.
          if (!raiz.ehAgrupador) return link(raiz)
          const texto = raiz.texto?.trim()
          return texto && filhos.length ? { id: raiz.itemId, texto, href: null, filhos } : null
        })
        .filter((item): item is ItemMenuPublico => item !== null)
      return { id: grupo.grupoId, titulo: grupo.grupoTitulo, itens }
    })
    .filter((grupo) => grupo.itens.length > 0)
}
