import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoEventos, atendimentos } from '@/db/schema'
import {
  TIPOS_EVENTO_ATENDIMENTO,
  type StatusAtendimento,
} from '../constants/atendimento'
import { alterarStatusDoAtendimento } from './alterar-status'
import { obterAcessoAtendimento } from './autorizacao'
import { adicionarItemDoChecklist } from './checklist'
import { publicarManifestacaoNoAtendimento } from './manifestacoes'
import { podeTransicionar } from './transicoes'

const DESTINO: StatusAtendimento = 'aguardando_cliente'

export type ResultadoSolicitacao =
  | {
      sucesso: true
      manifestacaoId: string
      itemChecklistId: string | null
      statusAlterado: boolean
    }
  | {
      sucesso: false
      motivo: 'sem-acesso' | 'vazia' | 'nao-encontrado' | 'transicao-invalida'
    }

/**
 * Pedido formal ao Cliente.
 *
 * Junta num gesto só o que a operação sempre fez em três: registrar no Protocolo
 * o que está sendo pedido, deixar a pendência visível como etapa do checklist e
 * parar o relógio da equipe passando o Atendimento para "Aguardando cliente".
 *
 * A ordem importa. O pedido é registrado antes de o status mudar: se a transição
 * falhar, o Cliente ao menos ficou sabendo o que precisa enviar — o contrário
 * deixaria um Atendimento parado sem ninguém saber esperando o quê.
 *
 * Nada aqui conclui nada: quando o Cliente responder, quem confere e marca a
 * etapa é a equipe.
 */
export async function solicitarAoCliente({
  atendimentoId,
  usuarioId,
  conteudo,
  etapaChecklist,
}: {
  atendimentoId: string
  usuarioId: string
  conteudo: string
  /** Título da etapa a criar. Vazio quando o pedido não vira etapa. */
  etapaChecklist?: string | null
}): Promise<ResultadoSolicitacao> {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso || acesso.vinculo === 'cliente') {
    return { sucesso: false, motivo: 'sem-acesso' }
  }

  const [atual] = await db
    .select({ status: atendimentos.status })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)
  if (!atual) return { sucesso: false, motivo: 'nao-encontrado' }

  const de = atual.status as StatusAtendimento
  // Já estar em "Aguardando cliente" é caso normal: pede-se mais uma coisa sem
  // precisar de transição. O que não pode é pedir a partir de um estado de onde
  // a máquina não permitiria chegar lá — encerrado, por exemplo.
  const precisaMover = de !== DESTINO
  if (precisaMover && !podeTransicionar(de, DESTINO)) {
    return { sucesso: false, motivo: 'transicao-invalida' }
  }

  const manifestacao = await publicarManifestacaoNoAtendimento({
    atendimentoId,
    usuarioId,
    conteudo,
  })
  if (!manifestacao.sucesso) {
    return {
      sucesso: false,
      motivo: manifestacao.motivo === 'vazia' ? 'vazia' : 'sem-acesso',
    }
  }

  let itemChecklistId: string | null = null
  if (etapaChecklist?.trim()) {
    const item = await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId,
      titulo: etapaChecklist,
      origem: 'solicitacao',
      visibilidade: 'cliente',
    })
    if (item.sucesso) itemChecklistId = item.id ?? null
  }

  await db.insert(atendimentoEventos).values({
    atendimentoId,
    tipo: TIPOS_EVENTO_ATENDIMENTO.solicitacaoAoCliente,
    descricao: 'Solicitação enviada ao Cliente pelo protocolo',
    autorId: usuarioId,
    // O Cliente precisa ver que foi chamado — o conteúdo do pedido está no
    // Protocolo, aqui fica só o fato.
    visivelCliente: true,
    metadados: {
      manifestacaoId: manifestacao.id,
      itemChecklistId,
    },
  })

  let statusAlterado = false
  if (precisaMover) {
    const transicao = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId,
      destino: DESTINO,
      motivo: 'Solicitação enviada ao Cliente',
    })
    statusAlterado = transicao.sucesso
  }

  return {
    sucesso: true,
    manifestacaoId: manifestacao.id,
    itemChecklistId,
    statusAlterado,
  }
}
