import { cache } from 'react'
import { filtrosCentralSchema } from '../schemas/artigo'
import { listarArtigosEmDestaque, listarArtigosPublicados, listarCategoriasAtivas } from './publico'

function primeiro(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

/**
 * Tudo que `/conhecimento` mostra, a partir da query da URL. Memorizado por
 * requisição: `generateMetadata` e a página leem uma vez só. Categoria
 * desconhecida ou inativa é ignorada (lista sem filtro), nunca erro.
 */
export const carregarCentral = cache(async (parametros: Record<string, string | string[] | undefined>) => {
  const filtros = filtrosCentralSchema.parse({
    busca: primeiro(parametros.busca),
    categoria: primeiro(parametros.categoria),
    pagina: primeiro(parametros.pagina),
  })
  const categorias = await listarCategoriasAtivas()
  const categoriaAtual = categorias.find((categoria) => categoria.slug === filtros.categoria) ?? null
  const semFiltro = !categoriaAtual && !filtros.busca && filtros.pagina === 1
  const [lista, destaques] = await Promise.all([
    listarArtigosPublicados({ busca: filtros.busca, categoriaSlug: categoriaAtual?.slug, pagina: filtros.pagina }),
    semFiltro ? listarArtigosEmDestaque() : Promise.resolve([]),
  ])
  return { filtros, categorias, categoriaAtual, lista, destaques }
})
