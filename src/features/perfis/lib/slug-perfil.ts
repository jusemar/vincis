import { and, eq, inArray, isNull, like, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { nomesDosEscritoriosPublicos } from '@/features/empresas/queries/escritorio-publico'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { PADRAO_SLUG_PERFIL, escolherSlugLivre, montarBaseSlugPerfil } from './montar-slug-perfil'

/**
 * Slug público do perfil: leitura e materialização.
 *
 * O slug nasce **uma vez**, na primeira vez que um perfil público precisa de
 * endereço (busca, sitemap, link antigo aberto ou script de preparação), e
 * nunca mais muda — é isso que mantém links compartilhados estáveis quando o
 * profissional troca de nome ou de cidade.
 *
 * Só prestador público (conta ativa, verificada, habilitado) ganha slug: um
 * cadastro em análise não tem endereço a anunciar. A gravação é condicional
 * (`slug_publico is null`) e o índice único garante a unicidade mesmo com duas
 * requisições simultâneas — quem perde a corrida tenta o próximo sufixo.
 */

const TENTATIVAS = 5

function condicaoPublico() {
  return and(eq(usuarios.status, 'ativo'), condicaoContaVerificada(), condicaoPrestadorPublico())
}

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: string; cause?: { code?: string } } | null)
  return codigo?.code === '23505' || codigo?.cause?.code === '23505'
}

async function slugsOcupados(base: string): Promise<Set<string>> {
  const linhas = await db
    .select({ slug: perfisProfissionais.slugPublico })
    .from(perfisProfissionais)
    .where(or(eq(perfisProfissionais.slugPublico, base), like(perfisProfissionais.slugPublico, `${base}-%`)))
  return new Set(linhas.map(({ slug }) => slug).filter((slug): slug is string => Boolean(slug)))
}

/**
 * Garante o slug de vários prestadores públicos de uma vez. Devolve o mapa
 * `prestadorId → slug` dos que passaram a ter (ou já tinham) slug. Quem não é
 * público fica de fora do mapa, sem erro.
 */
export async function garantirSlugsDosPrestadores(prestadorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(prestadorIds)]
  const resultado = new Map<string, string>()
  if (ids.length === 0) return resultado

  const linhas = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      slug: perfisProfissionais.slugPublico,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      modalidade: perfisProfissionais.modalidadeAtuacao,
      cidade: perfisProfissionais.cidade,
    })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(and(inArray(usuarios.id, ids), condicaoPublico()))

  const escritorios = await nomesDosEscritoriosPublicos(
    linhas.filter((linha) => linha.modalidade === 'escritorio').map(({ id }) => id),
  )

  for (const linha of linhas) {
    if (linha.slug) {
      resultado.set(linha.id, linha.slug)
      continue
    }
    const base = montarBaseSlugPerfil({
      nome: linha.nome,
      escritorioNome: escritorios.get(linha.id) ?? null,
      tipoProfissional: linha.tipoProfissional,
      cidade: linha.cidade,
    })
    const slug = await gravarSlug(linha.id, base)
    if (slug) resultado.set(linha.id, slug)
  }
  return resultado
}

async function gravarSlug(prestadorId: string, base: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    const candidato = escolherSlugLivre(base, await slugsOcupados(base))
    try {
      const [gravado] = await db
        .update(perfisProfissionais)
        .set({ slugPublico: candidato })
        // Condicional: se outra requisição já gravou, não sobrescreve.
        .where(and(eq(perfisProfissionais.usuarioId, prestadorId), isNull(perfisProfissionais.slugPublico)))
        .returning({ slug: perfisProfissionais.slugPublico })
      if (gravado?.slug) {
        console.info('[PERFIL_SLUG_GERADO]', { prestadorId, slug: gravado.slug })
        return gravado.slug
      }
      // Ninguém atualizado: outra requisição chegou antes. Lê o que ficou.
      const [atual] = await db
        .select({ slug: perfisProfissionais.slugPublico })
        .from(perfisProfissionais)
        .where(eq(perfisProfissionais.usuarioId, prestadorId))
        .limit(1)
      return atual?.slug ?? null
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro
      // Corrida pelo mesmo candidato: recalcula os ocupados e tenta de novo.
    }
  }
  console.error('[PERFIL_SLUG_FALHOU]', { prestadorId, base })
  return null
}

/** Atalho para um prestador só. Nulo quando não é prestador público. */
export async function garantirSlugDoPrestador(prestadorId: string): Promise<string | null> {
  return (await garantirSlugsDosPrestadores([prestadorId])).get(prestadorId) ?? null
}

/**
 * Prestador dono do slug. Não filtra visibilidade — quem chama decide com a
 * identidade pública (que já exige conta ativa, verificada e prestador público).
 */
export async function obterPrestadorPeloSlug(slug: string): Promise<string | null> {
  if (!PADRAO_SLUG_PERFIL.test(slug) || slug.length > 160) return null
  const [linha] = await db
    .select({ id: perfisProfissionais.usuarioId })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.slugPublico, slug))
    .limit(1)
  return linha?.id ?? null
}
