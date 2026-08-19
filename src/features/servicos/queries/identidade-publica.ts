import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { obterReputacaoDoPrestador } from '@/features/avaliacoes/queries/reputacao'
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

  if (!prestador) return null

  /**
   * A nota e a quantidade vêm da agregação real das avaliações.
   *
   * Antes saíam de `perfis_profissionais.avaliacao_media` / `total_avaliacoes`,
   * duas colunas preenchidas por script de demonstração. Os nomes dos campos
   * continuam iguais para que o bloco de métricas do perfil não mude nada —
   * mesmo tamanho, mesma cor, mesma posição —, e `mediaEmDecimos` preserva a
   * convenção "valor / 10" que aquele bloco já aplicava.
   *
   * Prestador sem avaliação nenhuma volta com `null` e `0`: é o que faz a tela
   * mostrar o estado vazio em vez de afirmar uma nota que ninguém deu.
   */
  const reputacao = await obterReputacaoDoPrestador(prestadorId)

  return {
    ...prestador,
    avaliacaoMedia: reputacao.mediaEmDecimos,
    totalAvaliacoes: reputacao.total,
  }
}
