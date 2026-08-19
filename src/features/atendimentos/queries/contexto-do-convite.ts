import { and, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoConvites,
  atendimentoParticipantes,
  atendimentos,
  contratacoesServico,
  usuarios,
} from '@/db/schema'
import type {
  PrioridadeAtendimento,
  StatusAtendimento,
} from '../constants/atendimento'

const clienteConta = alias(usuarios, 'contexto_cliente')

/**
 * O que o convidado enxerga **antes** de aceitar.
 *
 * É um DTO próprio, e não o operacional com campos escondidos, pela mesma razão
 * que o Cliente tem o dele: o que não pode ser lido não é selecionado, e por
 * isso não existe no objeto que atravessa para o navegador de quem ainda não
 * entrou no Atendimento.
 *
 * Fica de fora, de propósito: identidade do Cliente, Protocolo, Conversa
 * (Cliente e Interna), conteúdo dos arquivos, títulos das etapas do checklist e
 * o nome dos demais participantes. Entra o suficiente para decidir se aceita —
 * do que se trata, em que estado está, quanto trabalho já existe e para quando.
 */
export type ContextoConviteDTO = {
  protocolo: string
  titulo: string
  categoria: string
  status: StatusAtendimento
  prioridade: PrioridadeAtendimento
  prazoEm: string | null
  criadoEm: string
  /**
   * Cliente sob iniciais (`P. R.`).
   *
   * A carteira é do prestador que convidou. Quem ainda não aceitou não precisa
   * saber de quem é o serviço para avaliar a proposta — e, se recusar, não fica
   * sabendo. As iniciais existem só para diferenciar dois convites do mesmo
   * escritório.
   */
  clienteIniciais: string
  /** Serviço contratado, quando o Atendimento nasceu de uma contratação. */
  servico: string | null
  /** Volumes, não conteúdo: dá a medida do trabalho sem revelar o material. */
  totalEtapasChecklist: number
  totalEtapasConcluidas: number
  totalArquivos: number
  totalParticipantes: number
}

/** "Padaria Real" → "P. R." — o bastante para distinguir, longe de identificar. */
function iniciaisDoCliente(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '—'
  return partes
    .slice(0, 2)
    .map((parte) => `${parte[0].toUpperCase()}.`)
    .join(' ')
}

/**
 * Contexto limitado do Atendimento de um convite.
 *
 * A autorização é o próprio convite: só o destinatário lê, e só enquanto o
 * convite existir para ele. Depois do aceite a pessoa passa a ser participante e
 * lê o Atendimento pela consulta normal — este recorte deixa de ser o caminho.
 */
export async function obterContextoDoConvite(
  conviteId: string,
  usuarioId: string,
): Promise<ContextoConviteDTO | null> {
  const [registro] = await db
    .select({
      atendimentoId: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      categoria: atendimentos.categoria,
      status: atendimentos.status,
      prioridade: atendimentos.prioridade,
      prazoEm: atendimentos.prazoEm,
      criadoEm: atendimentos.createdAt,
      clienteNome: clienteConta.nome,
      servico: contratacoesServico.nomeServicoSnapshot,
    })
    .from(atendimentoConvites)
    .innerJoin(
      atendimentos,
      eq(atendimentos.id, atendimentoConvites.atendimentoId),
    )
    .innerJoin(clienteConta, eq(clienteConta.id, atendimentos.clienteUsuarioId))
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, atendimentos.contratacaoId),
    )
    .where(
      and(
        eq(atendimentoConvites.id, conviteId),
        eq(atendimentoConvites.destinatarioId, usuarioId),
      ),
    )
    .limit(1)

  if (!registro) return null

  const [etapas, arquivos, participantes] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        concluidas: sql<number>`count(*) filter (where ${atendimentoChecklistItens.concluido})::int`,
      })
      .from(atendimentoChecklistItens)
      .where(
        eq(atendimentoChecklistItens.atendimentoId, registro.atendimentoId),
      ),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, registro.atendimentoId)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, registro.atendimentoId)),
  ])

  return {
    protocolo: registro.protocolo,
    titulo: registro.titulo,
    categoria: registro.categoria,
    status: registro.status as StatusAtendimento,
    prioridade: registro.prioridade as PrioridadeAtendimento,
    prazoEm: registro.prazoEm?.toISOString() ?? null,
    criadoEm: registro.criadoEm.toISOString(),
    clienteIniciais: iniciaisDoCliente(registro.clienteNome),
    servico: registro.servico,
    totalEtapasChecklist: etapas[0]?.total ?? 0,
    totalEtapasConcluidas: etapas[0]?.concluidas ?? 0,
    totalArquivos: arquivos[0]?.total ?? 0,
    totalParticipantes: participantes[0]?.total ?? 0,
  }
}
