import { and, asc, eq, not, ilike } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { DOMINIO_CONTAS_DEMONSTRACAO } from '../constants/indexacao'

/** Teto do protocolo sitemap: 50.000 URLs por arquivo. */
const LIMITE_PERFIS_SITEMAP = 45_000

/**
 * Perfis públicos que podem ser anunciados a buscadores.
 *
 * Os critérios são exatamente os de `obterIdentidadePublica` — conta ativa,
 * verificada e prestador público (Profissional habilitado ou Colaborador com
 * vitrine pública) —, então todo perfil listado aqui abre com conteúdo real em
 * `/perfil-profissional?prestador=<id>`. A diferença é uma exclusão a mais: as
 * contas de demonstração (`@vincis.local`, domínio reservado que não recebe
 * e-mail) têm dados fictícios e não devem chegar ao índice do Google.
 *
 * Só leitura; devolve apenas o identificador e a data real da última alteração
 * do perfil — nenhum dado pessoal sai daqui.
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
    .where(
      and(
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorPublico(),
        not(ilike(usuarios.email, `%@${DOMINIO_CONTAS_DEMONSTRACAO}`)),
      ),
    )
    .orderBy(asc(usuarios.id))
    .limit(LIMITE_PERFIS_SITEMAP)
}
