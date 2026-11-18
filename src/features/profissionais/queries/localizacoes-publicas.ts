import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'

/**
 * As localizações que o filtro público de `/profissionais` oferece.
 *
 * Antes era uma lista fixa de capitais: quem atendia de uma cidade fora dela
 * (Recife, por exemplo) existia na vitrine mas não era encontrável pelo filtro.
 * Agora a lista sai do próprio cadastro, com os mesmos critérios da vitrine
 * (conta ativa, verificada e prestador habilitado) — o filtro nunca oferece uma
 * cidade sem ninguém, nem esconde uma cidade com profissional.
 *
 * Formato "Cidade, UF", o mesmo que a busca já desmonta em cidade + estado.
 */
export async function listarLocalizacoesPublicas(): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ cidade: perfisProfissionais.cidade, estado: perfisProfissionais.estado })
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(
      and(
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        // Público: profissional habilitado ou colaborador com vitrine pública.
        condicaoPrestadorPublico(),
        sql`length(btrim(${perfisProfissionais.cidade})) > 0`,
      ),
    )
    .orderBy(asc(perfisProfissionais.cidade), asc(perfisProfissionais.estado))

  return linhas.map(({ cidade, estado }) => `${cidade.trim()}, ${estado.trim().toUpperCase()}`)
}
