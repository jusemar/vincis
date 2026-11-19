import { z } from 'zod'
import { obterIdentidadePublicaDaRequisicao } from '@/features/servicos/queries/identidade-publica'
import { caminhoPerfilAmigavel } from '../constants/rotas-perfil'
import { garantirSlugDoPrestador } from './slug-perfil'

const identificador = z.string().uuid()

/**
 * Para onde o endereço antigo (`?prestador=<id>`) deve ir, ou `null` para
 * continuar renderizando ali mesmo.
 *
 * Só redireciona perfil público de verdade (mesma identidade que a página usa).
 * Cadastro anterior ao slug ganha o slug agora — uma vez. Os demais parâmetros
 * da URL seguem junto, menos o próprio `prestador`.
 */
export async function resolverRedirecionamentoPerfilLegado(
  prestadorId: string | undefined,
  parametros: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  if (!prestadorId || !identificador.safeParse(prestadorId).success) return null
  const identidade = await obterIdentidadePublicaDaRequisicao(prestadorId)
  if (!identidade) return null

  const slug = identidade.slugPublico ?? (await garantirSlugDoPrestador(prestadorId))
  if (!slug) return null

  const resto = new URLSearchParams()
  for (const [chave, valor] of Object.entries(parametros)) {
    if (chave === 'prestador' || valor === undefined) continue
    for (const item of Array.isArray(valor) ? valor : [valor]) resto.append(chave, item)
  }
  const query = resto.toString()
  return `${caminhoPerfilAmigavel(slug)}${query ? `?${query}` : ''}`
}
