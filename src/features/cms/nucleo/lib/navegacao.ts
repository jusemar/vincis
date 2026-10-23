import type { VerificadorSlugReservado } from './slugs-reservados'

/**
 * Linhas da consulta pública de navegação → grupos com links, na ordem.
 *
 * A consulta já filtra grupo ativo, item ativo e página publicada; aqui ficam a
 * montagem e duas defesas que não dependem do banco: slug reservado nunca vira
 * link (registro antigo, gravado antes de uma rota nova nascer) e grupo sem
 * nenhum link não aparece.
 */
export type LinhaNavegacaoPublica = {
  grupoId: string
  grupoTitulo: string
  grupoOrdem: number
  itemId: string
  itemOrdem: number
  texto: string | null
  paginaTitulo: string
  paginaSlug: string
}

export type GrupoNavegacaoPublico = {
  id: string
  titulo: string
  links: Array<{ id: string; href: string; texto: string }>
}

export function montarGruposPublicos(
  linhas: readonly LinhaNavegacaoPublica[],
  slugReservado: VerificadorSlugReservado,
): GrupoNavegacaoPublico[] {
  const ordenadas = [...linhas].sort(
    (a, b) =>
      a.grupoOrdem - b.grupoOrdem ||
      a.grupoId.localeCompare(b.grupoId) ||
      a.itemOrdem - b.itemOrdem ||
      a.itemId.localeCompare(b.itemId),
  )
  const grupos = new Map<string, GrupoNavegacaoPublico>()
  for (const linha of ordenadas) {
    if (slugReservado(linha.paginaSlug)) continue
    const grupo = grupos.get(linha.grupoId) ?? {
      id: linha.grupoId,
      titulo: linha.grupoTitulo,
      links: [],
    }
    grupo.links.push({
      id: linha.itemId,
      href: `/${linha.paginaSlug}`,
      texto: linha.texto?.trim() || linha.paginaTitulo,
    })
    grupos.set(linha.grupoId, grupo)
  }
  return [...grupos.values()]
}
