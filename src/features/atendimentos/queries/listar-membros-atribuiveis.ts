import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoParticipantes,
  empresaMembros,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { listarVinculosAtivos } from '@/features/empresas/queries/equipe'
import { obterAcessoAtendimento } from '../lib/autorizacao'

export type MembroAtribuivelDTO = {
  usuarioId: string
  nome: string
  email: string
  tipoProfissional: string | null
  avatarUrl: string | null
  /** A pessoa já participa deste Atendimento. */
  jaParticipa: boolean
}

/**
 * Membros da equipe que podem ser atribuídos a este Atendimento.
 *
 * "Equipe" é o vínculo ativo em `empresa_membros` nos escritórios do prestador
 * dono — a mesma definição da tela de Equipe. Quem já participa vem marcado em
 * vez de sumir da lista: some ao ser atribuído, o nome pareceria ter
 * desaparecido por erro.
 *
 * O prestador que atua sozinho recebe lista vazia, e é a verdade: não há equipe
 * para atribuir, o caminho dele é o convite externo.
 */
export async function listarMembrosAtribuiveis(
  atendimentoId: string,
  usuarioId: string,
): Promise<MembroAtribuivelDTO[]> {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return []
  if (acesso.vinculo !== 'prestador' && acesso.vinculo !== 'responsavel') {
    return []
  }

  const vinculos = await listarVinculosAtivos(acesso.prestadorId)
  const empresaIds = vinculos.map(({ empresaId }) => empresaId)
  if (!empresaIds.length) return []

  const [membros, participantes] = await Promise.all([
    db
      .selectDistinctOn([usuarios.id], {
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        tipoProfissional: perfisProfissionais.tipoProfissional,
        avatarUrl: perfisProfissionais.avatarUrl,
      })
      .from(empresaMembros)
      .innerJoin(usuarios, eq(usuarios.id, empresaMembros.usuarioId))
      .leftJoin(
        perfisProfissionais,
        eq(perfisProfissionais.usuarioId, usuarios.id),
      )
      .where(
        and(
          inArray(empresaMembros.empresaId, empresaIds),
          eq(empresaMembros.status, 'ativo'),
          // O Cliente do Atendimento nunca aparece como membro atribuível,
          // mesmo que por algum motivo tenha vínculo com o escritório.
          notInArray(usuarios.id, [acesso.clienteUsuarioId]),
        ),
      )
      .orderBy(asc(usuarios.id)),
    db
      .select({ usuarioId: atendimentoParticipantes.usuarioId })
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId)),
  ])

  const jaDentro = new Set(participantes.map(({ usuarioId: id }) => id))
  // O responsável participa por definição do Atendimento, tenha ou não linha
  // em participantes.
  jaDentro.add(acesso.responsavelId)

  return membros
    .map((membro) => ({
      ...membro,
      jaParticipa: jaDentro.has(membro.usuarioId),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
