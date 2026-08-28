import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { obterReputacaoDoPrestador } from '@/features/avaliacoes/queries/reputacao'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import type { CategoriaOportunidade } from '../constants/oportunidade'
import { categoriasCompativeisDoPrestador } from '../lib/compatibilidade'

/**
 * O Profissional a quem uma solicitação privada pode ser dirigida.
 *
 * As mesmas portas do perfil público — conta ativa, verificada e cadastro
 * habilitado —, mais uma: quais **categorias públicas** ele realmente alcança.
 * Essa lista é o vocabulário inteiro que o formulário privado oferece e a única
 * coisa que o servidor aceita, porque quem escolheu um Profissional específico
 * não pode pedir a ele o que ele não presta. Um advogado não recebe pedido
 * contábil nem por tela, nem por payload alterado à mão.
 *
 * Devolve `null` quando não há a quem dirigir — prestador inexistente, não
 * habilitado, ou sem nenhuma categoria pública compatível. Nesse caso não
 * existe entrada privada: é melhor não oferecer o botão do que oferecer um
 * caminho que o servidor vai recusar.
 *
 * A reputação entra porque a Área do Cliente mostra o cartão de quem recebeu o
 * pedido, com a mesma agregação real que as propostas usam — nenhuma segunda
 * fonte de nota.
 */
export type DestinatarioPrivadoDTO = {
  id: string
  nome: string
  avatarUrl: string | null
  /** Especialidade ou área principal, quando houver. */
  destaque: string | null
  cidade: string | null
  estado: string | null
  avaliacaoMedia: number | null
  totalAvaliacoes: number
  /** Categorias públicas que este Profissional pode atender. Nunca vazia. */
  categorias: CategoriaOportunidade[]
}

export async function obterDestinatarioPrivado(
  prestadorId: string,
): Promise<DestinatarioPrivadoDTO | null> {
  const [linha] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      avatarUrl: perfisProfissionais.avatarUrl,
      cidade: perfisProfissionais.cidade,
      estado: perfisProfissionais.estado,
      especialidades: perfisProfissionais.especialidades,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
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

  if (!linha) return null

  const categorias = categoriasCompativeisDoPrestador(linha)
  if (!categorias.length) return null

  const reputacao = await obterReputacaoDoPrestador(prestadorId)

  return {
    id: linha.id,
    nome: linha.nome,
    avatarUrl: linha.avatarUrl,
    destaque: linha.especialidades?.[0] ?? linha.areasAtuacao?.[0] ?? null,
    cidade: linha.cidade,
    estado: linha.estado,
    // Mesma convenção "valor / 10" das demais telas de reputação.
    avaliacaoMedia:
      reputacao.mediaEmDecimos != null ? reputacao.mediaEmDecimos / 10 : null,
    totalAvaliacoes: reputacao.total,
    categorias,
  }
}
