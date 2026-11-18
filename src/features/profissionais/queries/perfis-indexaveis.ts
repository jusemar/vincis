import { and, asc, eq, not, ilike, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { DOMINIO_CONTAS_DEMONSTRACAO } from '../constants/indexacao'

/** Teto do protocolo sitemap: 50.000 URLs por arquivo. */
const LIMITE_PERFIS_SITEMAP = 45_000

const identificadorPrestador = z.string().uuid()

/**
 * Regra única de "perfil que pode ir para buscadores" — usada pelo sitemap e
 * pela meta robots do perfil, para que os dois nunca discordem.
 *
 * Os critérios de exibição são exatamente os de `obterIdentidadePublica` —
 * conta ativa, verificada e prestador público (Profissional habilitado ou
 * Colaborador com vitrine pública) —, mais uma exclusão: as contas de
 * demonstração (`@vincis.local`, domínio reservado que não recebe e-mail) têm
 * dados fictícios e não devem chegar ao índice do Google. Elas continuam
 * abrindo normalmente; só não são anunciadas.
 */
function condicaoPerfilIndexavel(): SQL {
  return and(
    eq(usuarios.status, 'ativo'),
    condicaoContaVerificada(),
    condicaoPrestadorPublico(),
    not(ilike(usuarios.email, `%@${DOMINIO_CONTAS_DEMONSTRACAO}`)),
  ) as SQL
}

/**
 * Perfis indexáveis para o sitemap. Só leitura; devolve apenas o identificador
 * e a data real da última alteração do perfil — nenhum dado pessoal sai daqui.
 */
export async function listarPerfisIndexaveis(): Promise<
  { prestadorId: string; atualizadoEm: Date }[]
> {
  return db
    .select({
      prestadorId: usuarios.id,
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
