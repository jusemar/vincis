import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'

/**
 * Identidade pública de um prestador, para o perfil aberto por `?prestador=`.
 *
 * Exige conta ativa, verificada e cadastro habilitado — os mesmos critérios da
 * vitrine de `/profissionais`, para que ninguém apareça publicamente por uma
 * porta que a listagem não abriria.
 */
export async function obterIdentidadePublica(prestadorId: string) {
  const [prestador] = await db
    .select({
      nome: usuarios.nome,
      apresentacao: perfisProfissionais.apresentacao,
      experienciaAnos: perfisProfissionais.tempoExperiencia,
      avaliacaoMedia: perfisProfissionais.avaliacaoMedia,
      totalAvaliacoes: perfisProfissionais.totalAvaliacoes,
    })
    .from(usuarios)
    .innerJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(
      and(
        eq(usuarios.id, prestadorId),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorHabilitado(),
      ),
    )
    .limit(1)

  return prestador ?? null
}
