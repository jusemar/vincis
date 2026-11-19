import { and, asc, eq, isNull, not, ilike, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoVitrinePublica } from '../lib/vitrine-publica'
import { DOMINIO_CONTAS_DEMONSTRACAO } from '../constants/indexacao'

/** Teto do protocolo sitemap: 50.000 URLs por arquivo. */
const LIMITE_PERFIS_SITEMAP = 45_000

const identificadorPrestador = z.string().uuid()

/**
 * Regra única de "perfil que pode ir para buscadores" — usada pelo sitemap e
 * pela meta robots do perfil, para que os dois nunca discordem.
 *
 * Os critérios são os da vitrine (`lib/vitrine-publica`) — conta ativa,
 * verificada, prestador público, não ocultado pela Gestão e com foto —, mais
 * uma exclusão: as contas de
 * demonstração (`@vincis.local`, domínio reservado que não recebe e-mail) têm
 * dados fictícios e não devem chegar ao índice do Google. Elas continuam
 * abrindo normalmente; só não são anunciadas.
 */
function condicaoPerfilIndexavel(): SQL {
  return and(
    eq(usuarios.status, 'ativo'),
    condicaoContaVerificada(),
    // Vitrine pública: prestador público, não ocultado e com foto.
    condicaoVitrinePublica(),
    not(ilike(usuarios.email, `%@${DOMINIO_CONTAS_DEMONSTRACAO}`)),
  ) as SQL
}

/**
 * Perfis indexáveis para o sitemap. Só leitura; devolve apenas o identificador
 * o slug público e a data real da última alteração do perfil.
 */
export async function listarPerfisIndexaveis(): Promise<
  { prestadorId: string; slugPublico: string | null; atualizadoEm: Date }[]
> {
  return db
    .select({
      prestadorId: usuarios.id,
      slugPublico: perfisProfissionais.slugPublico,
      atualizadoEm: perfisProfissionais.updatedAt,
    })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(condicaoPerfilIndexavel())
    .orderBy(asc(usuarios.id))
    .limit(LIMITE_PERFIS_SITEMAP)
}

/**
 * Este perfil pode ser indexado? Consulta pela chave primária, uma linha.
 *
 * Identificador fora do formato UUID responde `false` sem tocar o banco — a
 * meta robots nunca quebra por causa de um `?prestador=` digitado à mão.
 */
export async function perfilEhIndexavel(prestadorId: string): Promise<boolean> {
  if (!identificadorPrestador.safeParse(prestadorId).success) return false
  const [linha] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(and(eq(usuarios.id, prestadorId), condicaoPerfilIndexavel()))
    .limit(1)
  return Boolean(linha)
}

/** Indexáveis que ainda não têm slug — para o sitemap materializar antes de listar. */
export async function listarIndexaveisSemSlug(limite: number): Promise<string[]> {
  const linhas = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(and(condicaoPerfilIndexavel(), isNull(perfisProfissionais.slugPublico)))
    .limit(limite)
  return linhas.map(({ id }) => id)
}
