import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentoParticipantes,
  atendimentos,
  empresaMembros,
  usuarios,
} from '@/db/schema'
import { listarVinculosAtivos } from '@/features/empresas/queries/equipe'
import {
  TIPOS_EVENTO_ATENDIMENTO,
  type PapelParticipante,
} from '../constants/atendimento'
import { obterAcessoAtendimento } from './autorizacao'
import type { ExecutorDb } from './executor'

export type ResultadoParticipante =
  | { sucesso: true; alterado: boolean }
  | {
      sucesso: false
      motivo:
        | 'sem-acesso'
        | 'nao-encontrado'
        | 'fora-da-equipe'
        | 'responsavel'
        | 'ja-participa'
    }

/**
 * Quem administra a composição do Atendimento.
 *
 * Mais restrito do que `exigirEquipe` do checklist de propósito: marcar uma
 * etapa é trabalho do dia a dia, mas decidir **quem entra** é do dono da
 * carteira e do responsável atual. Um convidado que entrou ontem não convida o
 * escritório inteiro hoje.
 */
async function exigirGestor(atendimentoId: string, usuarioId: string) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return null
  if (acesso.vinculo !== 'prestador' && acesso.vinculo !== 'responsavel') {
    return null
  }
  return acesso
}

async function nomeDaPessoa(executor: ExecutorDb, usuarioId: string) {
  const [pessoa] = await executor
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  return pessoa?.nome ?? 'Participante'
}

/**
 * Ids de quem já pertence à equipe do prestador dono do Atendimento.
 *
 * "Equipe" aqui é vínculo ativo em `empresa_membros` nos mesmos escritórios do
 * dono — a definição que a tela de Equipe já usa. Não inventamos um segundo
 * conceito de equipe só para os Atendimentos: se a pessoa aparece lá, ela é
 * atribuível aqui, e a recíproca também vale.
 *
 * O prestador que atua sozinho não tem escritório ativo e, portanto, não tem
 * ninguém para atribuir direto — para ele o caminho é o convite.
 */
export async function listarIdsDaEquipe(prestadorId: string) {
  const vinculos = await listarVinculosAtivos(prestadorId)
  const empresaIds = vinculos.map(({ empresaId }) => empresaId)
  if (!empresaIds.length) return new Set<string>()

  const membros = await db
    .select({ usuarioId: empresaMembros.usuarioId })
    .from(empresaMembros)
    .where(
      and(
        inArray(empresaMembros.empresaId, empresaIds),
        eq(empresaMembros.status, 'ativo'),
      ),
    )

  return new Set(membros.map(({ usuarioId }) => usuarioId))
}

/**
 * Insere alguém como participante do Atendimento.
 *
 * Serve tanto à atribuição direta quanto ao aceite de um convite — os dois
 * terminam na mesma linha de `atendimento_participantes`, e é isso que faz o
 * Atendimento aparecer para a pessoa: a consulta do quadro já filtra por
 * participação. `onConflictDoNothing` cobre o clique duplo sem estourar erro.
 */
export async function registrarParticipante(
  executor: ExecutorDb,
  {
    atendimentoId,
    usuarioId,
    papel = 'convidado',
    conviteId = null,
  }: {
    atendimentoId: string
    usuarioId: string
    papel?: PapelParticipante
    conviteId?: string | null
  },
) {
  const [linha] = await executor
    .insert(atendimentoParticipantes)
    .values({ atendimentoId, usuarioId, papel, conviteId })
    .onConflictDoNothing()
    .returning({ id: atendimentoParticipantes.id })

  return linha?.id ?? null
}

/**
 * Atribui direto um membro que já pertence à equipe.
 *
 * Sem convite e sem negociação: quem já está no escritório não precisa aceitar
 * nada para trabalhar num Atendimento da casa. A conferência de pertencimento é
 * feita aqui, no servidor — mandar um id de fora da equipe é recusado mesmo que
 * a tela ofereça o nome.
 *
 * O evento fica invisível ao Cliente: a composição interna da equipe é da casa,
 * como já acontece com `responsavel_definido`.
 */
export async function atribuirMembroDaEquipe({
  atendimentoId,
  usuarioId,
  membroId,
}: {
  atendimentoId: string
  usuarioId: string
  membroId: string
}): Promise<ResultadoParticipante> {
  const acesso = await exigirGestor(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  // O responsável já é participante por definição — a linha existiria só para
  // dizer o que o Atendimento já diz.
  if (membroId === acesso.responsavelId) {
    return { sucesso: false, motivo: 'ja-participa' }
  }

  const equipe = await listarIdsDaEquipe(acesso.prestadorId)
  if (!equipe.has(membroId)) return { sucesso: false, motivo: 'fora-da-equipe' }

  const [existente] = await db
    .select({ id: atendimentoParticipantes.id })
    .from(atendimentoParticipantes)
    .where(
      and(
        eq(atendimentoParticipantes.atendimentoId, atendimentoId),
        eq(atendimentoParticipantes.usuarioId, membroId),
      ),
    )
    .limit(1)
  if (existente) return { sucesso: true, alterado: false }

  await db.transaction(async (tx) => {
    await registrarParticipante(tx, {
      atendimentoId,
      usuarioId: membroId,
      papel: 'convidado',
    })

    const [nomeMembro, nomeAutor] = await Promise.all([
      nomeDaPessoa(tx, membroId),
      nomeDaPessoa(tx, usuarioId),
    ])

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.participanteAtribuido,
      descricao: `${nomeMembro} passou a participar deste atendimento (atribuído por ${nomeAutor})`,
      autorId: usuarioId,
      visivelCliente: false,
      metadados: { participanteId: membroId, origem: 'equipe' },
    })

    await tx
      .update(atendimentos)
      .set({ updatedAt: new Date() })
      .where(eq(atendimentos.id, atendimentoId))
  })

  return { sucesso: true, alterado: true }
}

/**
 * Retira alguém do Atendimento.
 *
 * O responsável não sai por aqui: trocar responsável é outra decisão, com outro
 * registro. Remover é imediato — a consulta do quadro reavalia participação a
 * cada carregamento, então o Atendimento some da tela da pessoa na hora.
 *
 * O que ela escreveu continua onde está. Histórico não se apaga porque alguém
 * saiu da equipe.
 */
export async function removerParticipante({
  atendimentoId,
  usuarioId,
  participanteId,
}: {
  atendimentoId: string
  usuarioId: string
  participanteId: string
}): Promise<ResultadoParticipante> {
  const acesso = await exigirGestor(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }
  if (participanteId === acesso.responsavelId) {
    return { sucesso: false, motivo: 'responsavel' }
  }

  return db.transaction(async (tx) => {
    const [removido] = await tx
      .delete(atendimentoParticipantes)
      .where(
        and(
          eq(atendimentoParticipantes.atendimentoId, atendimentoId),
          eq(atendimentoParticipantes.usuarioId, participanteId),
        ),
      )
      .returning({ id: atendimentoParticipantes.id })

    if (!removido) return { sucesso: true as const, alterado: false }

    const [nomeParticipante, nomeAutor] = await Promise.all([
      nomeDaPessoa(tx, participanteId),
      nomeDaPessoa(tx, usuarioId),
    ])

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.participanteRemovido,
      descricao: `${nomeParticipante} deixou de participar deste atendimento (por ${nomeAutor})`,
      autorId: usuarioId,
      visivelCliente: false,
      metadados: { participanteId },
    })

    return { sucesso: true as const, alterado: true }
  })
}
