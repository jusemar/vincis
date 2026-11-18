import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, empresas } from '@/db/schema'

/**
 * Nome público do escritório de cada prestador que atua como escritório.
 *
 * O cadastro do prestador guarda a pessoa (usuarios.nome) e o escritório vive
 * em `empresas`. Na vitrine, quem atua como escritório precisa aparecer pelo
 * nome do escritório, com a pessoa como responsável — e a fonte desse nome é a
 * empresa da qual ele é **proprietário ativo**, a mesma que o painel mostra em
 * "Equipe". `nome_atuacao` não é usado aqui porque congela na aprovação e pode
 * divergir do escritório real.
 *
 * Só proprietário: um membro convidado não "é" o escritório de outra pessoa.
 * Consulta única para a página inteira (sem N+1 na listagem).
 */
export async function nomesDosEscritoriosPublicos(
  usuarioIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(usuarioIds)]
  if (ids.length === 0) return new Map()

  const linhas = await db
    .select({ usuarioId: empresaMembros.usuarioId, nome: empresas.nome })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(
      and(
        inArray(empresaMembros.usuarioId, ids),
        eq(empresaMembros.funcao, 'proprietario'),
        eq(empresaMembros.status, 'ativo'),
        eq(empresas.status, 'ativo'),
      ),
    )

  return new Map(linhas.map((linha) => [linha.usuarioId, linha.nome]))
}

/** Atalho para um prestador só. Nulo quando não é proprietário de escritório ativo. */
export async function nomeDoEscritorioPublico(usuarioId: string): Promise<string | null> {
  return (await nomesDosEscritoriosPublicos([usuarioId])).get(usuarioId) ?? null
}
