import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoEventos, atendimentos, usuarios } from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes } from '@/features/notificacoes/lib/emitir'
import {
  ROTULO_STATUS_ATENDIMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
  type StatusAtendimento,
} from '../constants/atendimento'
import { obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento } from './autorizacao'
import { difundirNoAtendimento } from './difusao'
import { descreverTransicao, podeTransicionar } from './transicoes'

export type ResultadoTransicao =
  | { sucesso: true; de: StatusAtendimento; para: StatusAtendimento }
  | { sucesso: false; motivo: 'sem-acesso' | 'transicao-invalida' | 'nao-encontrado' }

/**
 * Move um Atendimento de status.
 *
 * Três guardas, nesta ordem: existe, você tem vínculo, a transição existe na
 * máquina de estados. O `where` do UPDATE repete o status de origem — se outra
 * pessoa mudou o status entre a leitura e a escrita, a atualização não encontra
 * a linha e a operação falha em vez de sobrescrever a decisão alheia.
 *
 * O Cliente não move o Atendimento: quem executa é a equipe. O Cliente
 * influencia o fluxo mandando mensagem e arquivo, e o prestador retoma.
 */
export async function alterarStatusDoAtendimento({
  atendimentoId,
  usuarioId,
  destino,
  motivo,
}: {
  atendimentoId: string
  usuarioId: string
  destino: StatusAtendimento
  motivo?: string | null
}): Promise<ResultadoTransicao> {
  // Concluir não é uma troca de status como as outras: é a entrega do serviço,
  // com observação final, arquivos, data, autor e manifestação no Protocolo.
  // `concluirAtendimento` faz tudo isso numa transação só. Deixar esta porta
  // aberta permitiria encerrar o Atendimento pela lateral, sem entrega e sem
  // registrar quem concluiu.
  if (destino === 'concluido') {
    return { sucesso: false, motivo: 'transicao-invalida' }
  }

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
  if (!podeTransicionar(de, destino)) {
    return { sucesso: false, motivo: 'transicao-invalida' }
  }

  const [autor] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)

  const resultado = await db.transaction(async (tx) => {
    let aviso: { destinatarios: string[]; titulo: string; protocolo: string } | null =
      null
    const [atualizado] = await tx
      .update(atendimentos)
      .set({ status: destino, updatedAt: new Date() })
      .where(
        and(eq(atendimentos.id, atendimentoId), eq(atendimentos.status, de)),
      )
      .returning({ id: atendimentos.id })

    if (!atualizado) {
      return {
        sucesso: false as const,
        motivo: 'transicao-invalida' as const,
        aviso,
      }
    }

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.statusAlterado,
      descricao: descreverTransicao(autor?.nome ?? 'Equipe', de, destino),
      autorId: usuarioId,
      // O andamento do próprio serviço é do interesse do Cliente.
      visivelCliente: true,
      metadados: {
        de,
        para: destino,
        deRotulo: ROTULO_STATUS_ATENDIMENTO[de],
        paraRotulo: ROTULO_STATUS_ATENDIMENTO[destino],
        motivo: motivo?.trim() || null,
      },
    })

    const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
    if (audiencia) {
      const titulo = `${audiencia.protocolo} mudou para ${ROTULO_STATUS_ATENDIMENTO[destino]}`
      aviso = {
        destinatarios: audiencia.todos,
        titulo,
        protocolo: audiencia.protocolo,
      }
      await emitirNotificacoes(tx, {
        // O andamento do serviço interessa aos dois lados — é a mesma decisão
        // que já torna este evento visível ao Cliente no histórico.
        destinatarios: audiencia.todos,
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.statusAlterado,
        titulo,
        resumo: descreverTransicao(autor?.nome ?? 'Equipe', de, destino),
        recursoTipo: 'atendimento',
        recursoId: atendimentoId,
        atendimentoId,
        protocolo: audiencia.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: audiencia.protocolo,
          aba: 'historico',
        },
      })
    }

    return { sucesso: true as const, de, para: destino, aviso }
  })

  // Mudança de status é das poucas coisas que mexem no quadro inteiro: o card
  // troca de coluna para todo mundo que acompanha o Atendimento.
  if (resultado.sucesso && resultado.aviso) {
    await difundirNoAtendimento({
      tipo: 'status',
      atendimentoId,
      protocolo: resultado.aviso.protocolo,
      autorId: usuarioId,
      destinatarios: resultado.aviso.destinatarios,
      titulo: resultado.aviso.titulo,
      aba: 'historico',
    })
  }

  return resultado.sucesso
    ? { sucesso: true as const, de, para: destino }
    : { sucesso: false as const, motivo: resultado.motivo }
}
